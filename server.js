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
            const image = card.querySelector('img')?.src ?? "";

            list.push({ title, middleText, location, url, image });
        });

        return list;
    });

    await browser.close();

    let finalOffers = offers.map(offer => {
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

    const graphicCardOffers = finalOffers.filter(o => o.price > 0 && isGraphicCardOffer(o.title));

    if (graphicCardOffers.length > 0) {
        const prices = graphicCardOffers.map(o => o.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        finalOffers = finalOffers.map(offer => {
            if (offer.price > 0 && isGraphicCardOffer(offer.title) && maxPrice !== minPrice) {
                offer.score = Math.round(((maxPrice - offer.price) / (maxPrice - minPrice)) * 100);
            } else {
                offer.score = 0;
            }
            return offer;
        });
    } else {
        finalOffers = finalOffers.map(offer => {
            offer.score = 0;
            return offer;
        });
    }

    res.json(finalOffers.sort((a, b) => b.score - a.score));
});

app.listen(PORT, () => {
    console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});
