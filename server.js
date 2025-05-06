const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

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

    const include = [
        "grafikkarte", "gpu", "geforce", "gtx", "rtx", "rx", "radeon", "intel arc", "a750", "a770", "arc a"
    ];
    const exclude = [
        "gaming pc", "rechner", "laptop", "notebook", "setup", "system", "komplett", "bundle", "monitor", "mainboard", "computer", "tower"
    ];

    return include.some(word => titleLower.includes(word)) &&
           !exclude.some(word => titleLower.includes(word));
}

app.get('/scrape', async (req, res) => {
    const query = req.query.query || "grafikkarte";
    const search = query.trim().replace(/\s+/g, '-');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36'
    });

    let allOffers = [];

    const pagesToScrape = parseInt(req.query.pages) || 10; // Standardwert 10, wenn nichts übergeben
for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {  
        const url = `https://www.kleinanzeigen.de/s-seite:${pageNum}/${search}/k0`;  // Seite-Nummer anpassen
        console.log(`🔍 Lade Seite ${pageNum}: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000); // 3 Sekunden warten

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

        allOffers = allOffers.concat(offers);
    }

    await browser.close();

    // 🔁 Duplikate entfernen (basierend auf URL)
    const uniqueOffersMap = new Map();
    allOffers.forEach(offer => {
        if (!uniqueOffersMap.has(offer.url)) {
            uniqueOffersMap.set(offer.url, offer);
        }
    });
    allOffers = Array.from(uniqueOffersMap.values());

    // "Suche"-Filter
    let filteredOffers = allOffers.filter(offer =>
        !offer.title.toLowerCase().includes("suche")
    );

    // Preise und Infos extrahieren
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

    // In zwei Kategorien aufteilen
    const gpuOffers = finalOffers.filter(o => o.price > 0 && isGraphicCardOffer(o.title));
    const otherOffers = finalOffers.filter(o => o.price > 0 && !isGraphicCardOffer(o.title));

    // GPU Scores berechnen
    if (gpuOffers.length > 1) {
        const gpuPrices = gpuOffers.map(o => o.price);
        const minPrice = Math.min(...gpuPrices);
        const maxPrice = Math.max(...gpuPrices);

        gpuOffers.forEach(offer => {
            offer.score = maxPrice !== minPrice
                ? Math.round(((maxPrice - offer.price) / (maxPrice - minPrice)) * 100)
                : 0;
        });
    }

    // Andere Scores berechnen
    if (otherOffers.length > 1) {
        const otherPrices = otherOffers.map(o => o.price);
        const minPrice = Math.min(...otherPrices);
        const maxPrice = Math.max(...otherPrices);

        otherOffers.forEach(offer => {
            offer.score = maxPrice !== minPrice
                ? Math.round(((maxPrice - offer.price) / (maxPrice - minPrice)) * 100)
                : 0;
        });
    }

    // Angebote ohne Preis
    const remaining = finalOffers.filter(o => o.price === 0);
    remaining.forEach(offer => offer.score = 0);

    // Alle zusammenführen
    const allSorted = [...gpuOffers, ...otherOffers, ...remaining];

    // Nach Score sortiert zurückgeben
    res.json(allSorted.sort((a, b) => b.score - a.score));
});

app.listen(PORT, () => {
    console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});
