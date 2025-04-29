const express = require('express');
const { chromium } = require('playwright');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

// Hilfsfunktion: Preis aus Text extrahieren (verbessert für Tausendertrennungen)
function extractPrice(text) {
    const match = text.match(/([\d\.]+)\s*€/);
    if (match) {
        return parseFloat(match[1].replace(/\./g, '').replace(",", "."));
    }
    return null;
}

// Hilfsfunktion: Preis-Typ (VB oder Festpreis) erkennen
function extractPriceType(text) {
    if (text.toLowerCase().includes("vb")) {
        return "VB";
    } else {
        return "Festpreis";
    }
}

app.get('/scrape', async (req, res) => {
    const query = req.query.query || "grafikkarte";
    const search = query.trim().replace(/\s+/g, '-');
    const url = `https://www.kleinanzeigen.de/s-${search}/k0`;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36'
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const offers = await page.evaluate(() => {
        const cards = document.querySelectorAll('article.aditem');
        const list = [];

        cards.forEach(card => {
            const title = card.querySelector('a.ellipsis')?.innerText ?? "";
            const location = card.querySelector('.aditem-main--top')?.innerText ?? "";
            const href = card.querySelector('a.ellipsis')?.getAttribute('href') ?? "";
            const url = href.startsWith("http") ? href : 'https://www.kleinanzeigen.de' + href;

            const middleText = card.querySelector('.aditem-main--middle')?.innerText ?? "";

            list.push({ title, middleText, location, url });
        });

        return list;
    });

    const finalOffers = offers.map(offer => {
        const price = extractPrice(offer.middleText);
        const priceType = extractPriceType(offer.middleText);
        const score = price ? (8 / price * 10).toFixed(2) : 0;
        return {
            title: offer.title,
            price: price ?? 0,
            priceType: price ? priceType : "unbekannt",
            location: offer.location,
            url: offer.url,
            score: score
        };
    });

    await browser.close();
    res.json(finalOffers.sort((a, b) => b.score - a.score));
});

app.listen(PORT, () => {
    console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});
