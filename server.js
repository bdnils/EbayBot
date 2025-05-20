// GANZE DATEI MIT ÄNDERUNGEN

const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

let currentScraping = null;

const locationMap = {
    "46485": "1866",
    "46483": "1867",
    "46514": "1868",
    "46487": "1868",
};

function extractPrice(text) {
    const match = text.match(/([\d\.]+)\s*€/);
    if (match) {
        return parseFloat(match[1].replace(/\./g, '').replace(",", "."));
    }
    return null;
}

function extractPriceType(text) {
    if (text.toLowerCase().includes("vb")) {
        return "VB";
    } else {
        return "Festpreis";
    }
}

function isGraphicCardOffer(title) {
    const titleLower = title.toLowerCase();
    const include = ["grafikkarte", "gpu", "geforce", "gtx", "rtx", "rx", "radeon", "intel arc", "a750", "a770", "arc a"];
    return include.some(word => titleLower.includes(word));
}

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

    // ✨ Ausschlusswörter vom Client lesen
    const rawExcludes = req.query.excludedWords || '';
    const excludedWords = rawExcludes.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, wie Gecko) Chrome/123 Safari/537.36'
    });

    let allOffers = [];

    for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {
        if (abortController.signal.aborted) {
            console.log("❌ Scraping wurde abgebrochen");
            await browser.close();
            currentScraping = null;
            return res.status(499).json({ message: 'Suche abgebrochen.' });
        }

        const priceLimit = parseInt(req.query.priceLimit) || 0; // 0 = kein Limit
        const minPrice = 2;
        const priceSegment = priceLimit > 0 ? `preis:${minPrice}:${priceLimit}/` : `preis:${minPrice}:/`;

const url = req.query.plz && locationMap[req.query.plz]
    ? `https://www.kleinanzeigen.de/s-${req.query.plz}/${priceSegment}seite:${pageNum}/${search}/k0l${ortId}r${radius}`
    : `https://www.kleinanzeigen.de/${priceSegment}s-seite:${pageNum}/${search}/k0`;


        console.log(`🔍 Lade Seite ${pageNum}: ${url}`);

        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });
        } catch (err) {
            if (abortController.signal.aborted) {
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

    // Dubletten entfernen
    const uniqueOffersMap = new Map();
    allOffers.forEach(offer => {
        if (!uniqueOffersMap.has(offer.url)) {
            uniqueOffersMap.set(offer.url, offer);
        }
    });
    allOffers = Array.from(uniqueOffersMap.values());

    // ✨ Ausschlussfilter anwenden
    let filteredOffers = allOffers.filter(offer => {
        const title = offer.title.toLowerCase();
        return !excludedWords.some(keyword => title.includes(keyword));
    });

    // Preis und Metadaten zuordnen
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

    // Bewertung berechnen (Score)
    const gpuOffers = finalOffers.filter(o => o.price > 0 && isGraphicCardOffer(o.title));
    const otherOffers = finalOffers.filter(o => o.price > 0 && !isGraphicCardOffer(o.title));

    const assignScore = (offers) => {
        if (offers.length > 1) {
            const prices = offers.map(o => o.price);
            const min = Math.min(...prices), max = Math.max(...prices);
            offers.forEach(o => o.score = (max !== min) ? Math.round(((max - o.price) / (max - min)) * 100) : 0);
        } else {
            offers.forEach(o => o.score = 0);
        }
    };

    assignScore(gpuOffers);
    assignScore(otherOffers);

    const remaining = finalOffers.filter(o => o.price === 0);
    remaining.forEach(o => o.score = 0);

    const allSorted = [...gpuOffers, ...otherOffers, ...remaining];
    res.json(allSorted.sort((a, b) => b.score - a.score));
});

app.post('/cancel', (req, res) => {
    if (currentScraping) {
        currentScraping.abort();
        currentScraping = null;
        res.json({ message: 'Suche abgebrochen.' });
    } else {
        res.status(404).json({ message: 'Keine aktive Suche.' });
    }
});
app.listen(3000, '0.0.0.0', () => console.log('Server l�uft auf Port 3000'));
