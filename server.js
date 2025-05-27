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
    "46487": "1868", // Korrigiert, falls es sich um dieselbe Ort-ID handeln soll, oder anpassen
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

    const plz = req.query.plz; // Kann undefined sein
    const radius = req.query.radius; // Kann undefined sein
    let ortId = null; // ortId initialisieren

    // ortId nur bestimmen, wenn plz vorhanden ist
    if (plz) {
        ortId = locationMap[plz];
        if (!ortId) {
            // Wenn PLZ angegeben, aber nicht in der Map, ist es ein Fehler.
            currentScraping = null; // Wichtig: Suche zurücksetzen, um Blockaden zu verhindern
            return res.status(400).json({ message: `Keine Ort-ID für die angegebene PLZ ${plz} gefunden.` });
        }
    }

    const rawExcludes = req.query.excludeWords || '';
    const excludedWords = rawExcludes.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

    const minPrice = req.query.minPrice ? parseInt(req.query.minPrice) : null;
    const maxPrice = req.query.priceLimit ? parseInt(req.query.priceLimit) : null;

    let preisSegment = '';
    if (minPrice !== null && maxPrice !== null) {
        preisSegment = `/preis:${minPrice}:${maxPrice}`;
    } else if (minPrice !== null) {
        preisSegment = `/preis:${minPrice}:`;
    } else if (maxPrice !== null) {
        preisSegment = `/preis::${maxPrice}`;
    }

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, wie Gecko) Chrome/123 Safari/537.36'
        });

        let allOffers = [];

        for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {
            if (abortController.signal.aborted) {
                console.log('Suche wurde extern abgebrochen.');
                break; // Schleife verlassen, wenn abgebrochen
            }

            // --- Beginn der URL-Konstruktion ---
            let urlPath = "";

            // 1. PLZ-Teil (wenn PLZ und gültige ortId existieren)
            if (plz && ortId) {
                urlPath += plz;
            }

            // 2. Seitennummer-Teil (wenn pageNum > 1)
            if (pageNum > 1) {
                if (urlPath.length > 0) urlPath += "/";
                urlPath += `seite:${pageNum}`;
            }

            // 3. Preissegment-Teil (preisSegment enthält führenden "/" falls nicht leer)
            if (preisSegment) {
                if (urlPath.length > 0) {
                    urlPath += preisSegment;
                } else {
                    // preisSegment ist der erste Teil nach "s-", daher führenden "/" entfernen
                    urlPath += preisSegment.substring(1);
                }
            }

            // 4. Suchbegriff-Teil (immer vorhanden)
            if (urlPath.length > 0) {
                urlPath += "/";
            }
            urlPath += search;

            // 5. Kategorie-Teil (immer /k0)
            urlPath += "/k0";

            // 6. Ort-ID und Radius-Teil (wenn ortId vorhanden ist)
            if (ortId) {
                urlPath += `l${ortId}`;
                if (radius) { // Radius nur hinzufügen, wenn ortId und radius vorhanden sind
                    urlPath += `r${radius}`;
                }
            }

            const url = `https://www.kleinanzeigen.de/s-${urlPath}`;
            // --- Ende der URL-Konstruktion ---

            console.log(`🔍 Lade Seite ${pageNum}: ${url}`);

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            } catch (err) {
                if (abortController.signal.aborted) {
                    console.log('Timeout beim Laden der Seite, aber Suche bereits abgebrochen.');
                    break; // Schleife verlassen
                } else if (err.name === 'TimeoutError') {
                    console.warn(`Timeout beim Laden der Seite ${pageNum}: ${url}. Überspringe...`);
                    continue; // Nächste Seite versuchen
                } else {
                    throw err; // Anderen Fehler weiterwerfen
                }
            }

            if (abortController.signal.aborted) break; // Erneut prüfen vor dem Warten
            await page.waitForTimeout(3000); // Kurze Pause, um dynamische Inhalte zu laden oder Rate Limits zu respektieren

            if (abortController.signal.aborted) break; // Erneut prüfen vor der Auswertung

            const offersOnPage = await page.evaluate(() => {
                const cards = document.querySelectorAll('article.aditem');
                const list = [];
                cards.forEach(card => {
                    const titleElement = card.querySelector('a.ellipsis');
                    const title = titleElement?.innerText ?? "";
                    const href = titleElement?.getAttribute('href') ?? "";
                    const itemUrl = href.startsWith("http") ? href : (href ? 'https://www.kleinanzeigen.de' + href : "");
                    
                    // Sicherstellen, dass nur gültige Angebote mit Titel und URL erfasst werden
                    if (title && itemUrl) {
                        const location = card.querySelector('.aditem-main--top')?.innerText ?? "";
                        const middleText = card.querySelector('.aditem-main--middle')?.innerText ?? "";
                        const image = card.querySelector('img')?.src ?? "";
                        list.push({ title, middleText, location, url: itemUrl, image });
                    }
                });
                return list;
            });

            if (offersOnPage.length === 0 && pageNum > 1) { // Wenn nach der ersten Seite keine Angebote mehr kommen
                 console.log(`Keine weiteren Angebote auf Seite ${pageNum} gefunden.`);
                 break;
            }
            allOffers = allOffers.concat(offersOnPage);
            if (offersOnPage.length < 20 && pageNum > 1) { // Oft ein Indikator für das Ende der Ergebnisse
                console.log(`Weniger als 20 Angebote auf Seite ${pageNum}, möglicherweise Ende der Ergebnisse.`);
                // break; // Optional: Suche abbrechen, wenn nicht voll
            }
        }

        const uniqueOffersMap = new Map();
        allOffers.forEach(offer => {
            if (offer.url && !uniqueOffersMap.has(offer.url)) { // Nur Angebote mit URL berücksichtigen
                uniqueOffersMap.set(offer.url, offer);
            }
        });
        allOffers = Array.from(uniqueOffersMap.values());

        let filteredOffers = allOffers.filter(offer => {
            const title = offer.title.toLowerCase();
            return !excludedWords.some(keyword => title.includes(keyword));
        });

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

        const assignScore = (offersList) => {
            if (offersList.length > 1) {
                const prices = offersList.map(o => o.price);
                const min = Math.min(...prices), max = Math.max(...prices);
                offersList.forEach(o => o.score = (max !== min) ? Math.round(((max - o.price) / (max - min)) * 100) : 0);
            } else {
                offersList.forEach(o => o.score = 0);
            }
        };

        assignScore(gpuOffers);
        assignScore(otherOffers);

        const remaining = finalOffers.filter(o => o.price === 0);
        remaining.forEach(o => o.score = 0);

        const allSorted = [...gpuOffers, ...otherOffers, ...remaining];
        res.json(allSorted.sort((a, b) => b.score - a.score));

    } catch (error) {
        if (abortController.signal.aborted) {
            return res.status(499).json({ message: 'Suche abgebrochen durch Benutzer.' });
        }
        console.error('Fehler während des Scrapings:', error);
        res.status(500).json({ message: 'Fehler während des Scrapings.', error: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
        currentScraping = null;
        console.log('Scraping-Vorgang beendet und Ressourcen freigegeben.');
    }
});

app.post('/cancel', (req, res) => {
    if (currentScraping) {
        console.log('Empfange Abbruchanfrage...');
        currentScraping.abort(); // Signalisiert den Abbruch
        // currentScraping wird in der finally-Klausel oder bei Fehlerbehandlung der /scrape Route auf null gesetzt
        res.json({ message: 'Suche wird abgebrochen.' });
    } else {
        res.status(404).json({ message: 'Keine aktive Suche zum Abbrechen vorhanden.' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});