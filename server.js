const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

let currentScraping = null;

// 🗺️ Mapping von PLZ zu Ort-ID
const locationMap = {
    "46485": "1866",
    "46483": "1867",
    "46514": "1868"
};

// Preis extrahieren
function extractPrice(text) {
    const match = text.match(/([\d\.]+)\s*€/);
    if (match) {
        return parseFloat(match[1].replace(/\./g, '').replace(",", "."));
    }
    return null;
}

// Preis-Typ erkennen
function extractPriceType(text) {
    if (text.toLowerCase().includes("vb")) {
        return "VB";
    } else {
        return "Festpreis";
    }
}

// Erkennung: Ist es eine Grafikkarte?
function isGraphicCardOffer(title) {
    const titleLower = title.toLowerCase();
    const include = ["grafikkarte", "gpu", "geforce", "gtx", "rtx", "rx", "radeon", "intel arc", "a750", "a770", "arc a"];
    const exclude = ["gaming pc", "rechner", "laptop", "notebook", "setup", "system", "komplett", "bundle", "monitor", "mainboard", "computer", "tower"];

    return include.some(word => titleLower.includes(word)) &&
           !exclude.some(word => titleLower.includes(word));
}

// Route zum Scraping
app.get('/scrape', async (req, res) => {
    if (currentScraping) {
        return res.status(409).json({ message: 'Eine Suche läuft bereits.' });
    }

    const abortController = new AbortController();
    currentScraping = abortController;

    const query = req.query.query || "grafikkarte";
    const search = query.trim().replace(/\s+/g, '-');
    const pagesToScrape = Math.min(parseInt(req.query.pages) || 10, 50);

    const plz = req.query.plz || "46485";
    const radius = req.query.radius || "0";
    const ortId = locationMap[plz];

    if (!ortId) {
        return res.status(400).json({ message: `Keine Ort-ID für PLZ ${plz} gefunden.` });
    }

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, wie Gecko) Chrome/123 Safari/537.36'
    });

    let allOffers = [];

    for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {
        let url = '';

if (req.query.plz && locationMap[req.query.plz]) {
    const ortId = locationMap[req.query.plz];
    url = `https://www.kleinanzeigen.de/s-${req.query.plz}/seite:${pageNum}/${search}/k0l${ortId}r${radius}`;
} else {
    url = `https://www.kleinanzeigen.de/s-seite:${pageNum}/${search}/k0`;
}
        console.log(`🔍 Lade Seite ${pageNum}: ${url}`);

        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
        } catch (err) {
            if (abortController.signal.aborted) {
                console.log("❌ Scraping wurde abgebrochen");
                await browser.close();
                currentScraping = null;
                return res.status(499).json({ message: 'Suche abgebrochen.' });
            } else {
                throw err;
            }
        }

        await page.waitForTimeout(3000);

        const offers = await page.evaluate(() => {
            const cards = document.querySelectorAll('article.aditem');
            const list = [];

            cards.forEach(card => {
                const title = card.querySelector('a.ellipsis')?.innerText ?? "";
                const location = card.querySelector('.aditem-main--top')?.innerText ?? "";
                const href = card.querySelector('a.ellipsis')?.getAttribute('href') ?? "";
                const url = href.startsWith("http") ? href : 'https://www.kleinanzeigen.de' + href;
                const middleText = card.querySelector('.aditem-main--middle')?.innerText ?? "";
                const image = card.querySelector('img')?.src ?? "";

                list.push({ title, middleText, location, url, image });
            });

            return list;
        });

        if (offers.length === 0) {
            console.log(`🚫 Keine Angebote mehr auf Seite ${pageNum}. Beende Suche.`);
            break;
        }

        allOffers = allOffers.concat(offers);
    }

    await browser.close();
    currentScraping = null;

    const uniqueOffersMap = new Map();
    allOffers.forEach(offer => {
        if (!uniqueOffersMap.has(offer.url)) {
            uniqueOffersMap.set(offer.url, offer);
        }
    });
    allOffers = Array.from(uniqueOffersMap.values());

    let filteredOffers = allOffers.filter(offer =>
        !offer.title.toLowerCase().includes("suche")
    );

    let finalOffers = filteredOffers.map(offer => {
        const price = extractPrice(offer.middleText);
        const priceType = extractPriceType(offer.middleText);
        return {
            title: offer.title,
            price: price ?? 0,
            priceType: price ? priceType : "unbekannt",
            location: offer.location,
            url: offer.url,
            image: offer.image
        };
    });

    const gpuOffers = finalOffers.filter(o => o.price > 0 && isGraphicCardOffer(o.title));
    const otherOffers = finalOffers.filter(o => o.price > 0 && !isGraphicCardOffer(o.title));

    if (gpuOffers.length > 1) {
        const prices = gpuOffers.map(o => o.price);
        const min = Math.min(...prices), max = Math.max(...prices);
        gpuOffers.forEach(o => o.score = (max !== min) ? Math.round(((max - o.price) / (max - min)) * 100) : 0);
    }

    if (otherOffers.length > 1) {
        const prices = otherOffers.map(o => o.price);
        const min = Math.min(...prices), max = Math.max(...prices);
        otherOffers.forEach(o => o.score = (max !== min) ? Math.round(((max - o.price) / (max - min)) * 100) : 0);
    }

    const remaining = finalOffers.filter(o => o.price === 0);
    remaining.forEach(o => o.score = 0);

    const allSorted = [...gpuOffers, ...otherOffers, ...remaining];
    res.json(allSorted.sort((a, b) => b.score - a.score));
});

// Abbrechen-Route
app.post('/cancel', (req, res) => {
    if (currentScraping) {
        currentScraping.abort();
        currentScraping = null;
        res.json({ message: 'Suche abgebrochen.' });
    } else {
        res.status(404).json({ message: 'Keine aktive Suche.' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});
