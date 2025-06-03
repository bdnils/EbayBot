const express = require('express');
const { chromium } = require('playwright');
const validCodes = require('./users');
const app = express();
const PORT = 3000;

app.use(express.static('public')); // Stellt sicher, dass HTML, CSS, JS aus dem 'public'-Ordner geladen werden

let currentScraping = null;

const locationMap = {
    "46485": "1866",
    "46483": "1867",
    "46514": "1756",
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
    const searchQuery = query.trim().replace(/\s+/g, '-'); // search ist bereits eine Konstante oben, umbenannt zu searchQuery
    const pagesToScrape = Math.min(parseInt(req.query.pages) || 10, 50);

    const plz = req.query.plz;
    const radius = req.query.radius;
    let ortId = null;

    if (plz) {
        ortId = locationMap[plz];
        if (!ortId) {
            currentScraping = null;
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

    // Kategorie-Parameter vom Client
    const categorySlug = req.query.categorySlug;
    const categoryId = req.query.categoryId;

    let finalUrl;
    let urlParts = [];

    if (categorySlug && categoryId) {
        // URL-Aufbau MIT Kategorie
        // Beispiel: https://www.kleinanzeigen.de/s-autos/46514/seite:2/vw/k0c216l1756r100
        let basePath = `s-${categorySlug}`;
        
        if (plz && ortId) {
            basePath += `/${plz}`;
        }
        if (req.query.pages && parseInt(req.query.pages) > 1 && pagesToScrape > 1) { // Nur wenn pageNum > 1 relevant wird
             // Seite wird in der Schleife hinzugefügt
        }
        if (preisSegment) { // preisSegment enthält bereits führendes "/"
            basePath += preisSegment;
        }
        basePath += `/${searchQuery}`;
        basePath += `/k0c${categoryId}`; // Gemäß Beispiel k0c{ID}

        if (ortId) {
            basePath += `l${ortId}`;
            if (radius) {
                basePath += `r${radius}`;
            }
        }
        // finalUrl wird unten in der Schleife pro Seite korrekt zusammengesetzt
        // Das ist nur der Basis-Pfad für die Kategorie-Suche
    } else {
        // URL-Aufbau OHNE Kategorie (alte Logik)
        // Hier wird finalUrl nicht direkt gesetzt, sondern die Logik in der Schleife greift
    }


    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, wie Gecko) Chrome/123 Safari/537.36'
        });
        const page = await context.newPage();
        

        let allOffers = [];

        for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {
            if (abortController.signal.aborted) {
                console.log('Suche wurde extern abgebrochen.');
                break;
            }

            let currentUrlPath = "";
            if (categorySlug && categoryId) {
                currentUrlPath = `s-${categorySlug}`;
                if (plz && ortId) {
                    currentUrlPath += `/${plz}`;
                }
                if (pageNum > 1) {
                    currentUrlPath += `/seite:${pageNum}`;
                }
                if (preisSegment) {
                    currentUrlPath += preisSegment;
                }
                currentUrlPath += `/${searchQuery}`;
                currentUrlPath += `/k0c${categoryId}`;
                if (ortId) {
                    currentUrlPath += `l${ortId}`;
                    if (radius) {
                        currentUrlPath += `r${radius}`;
                    }
                }
                finalUrl = `https://www.kleinanzeigen.de/${currentUrlPath}`;

            } else {
                // Alte URL-Logik, wenn keine Kategorie ausgewählt ist
                let legacyPath = "";
                if (plz && ortId) {
                    legacyPath += plz;
                }
                if (pageNum > 1) {
                    if (legacyPath.length > 0) legacyPath += "/";
                    legacyPath += `seite:${pageNum}`;
                }
                if (preisSegment) {
                    if (legacyPath.length > 0) {
                        legacyPath += preisSegment;
                    } else {
                        legacyPath += preisSegment.substring(1); // führenden "/" entfernen
                    }
                }
                if (legacyPath.length > 0) {
                    legacyPath += "/";
                }
                legacyPath += searchQuery;
                legacyPath += "/k0"; // Standardkategorie "Alle Kategorien"
                if (ortId) {
                    legacyPath += `l${ortId}`;
                    if (radius) {
                        legacyPath += `r${radius}`;
                    }
                }
                finalUrl = `https://www.kleinanzeigen.de/s-${legacyPath}`;
            }
            
            console.log(`🔍 Lade Seite ${pageNum}: ${finalUrl}`);

            try {
                await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            } catch (err) {
                if (abortController.signal.aborted) {
                    console.log('Timeout beim Laden der Seite, aber Suche bereits abgebrochen.');
                    break;
                } else if (err.name === 'TimeoutError') {
                    console.warn(`Timeout beim Laden der Seite ${pageNum}: ${finalUrl}. Überspringe...`);
                    continue;
                } else {
                    throw err;
                }
            }

            if (abortController.signal.aborted) break;
            await page.waitForTimeout(2000 + Math.random() * 1000); // Leichte Varianz

            if (abortController.signal.aborted) break;

            const offersOnPage = await page.evaluate(() => {
                const cards = document.querySelectorAll('article.aditem');
                const list = [];
                cards.forEach(card => {
                    const titleElement = card.querySelector('a.ellipsis');
                    const title = titleElement?.innerText?.trim() ?? "";
                    const href = titleElement?.getAttribute('href') ?? "";
                    const itemUrl = href.startsWith("http") ? href : (href ? 'https://www.kleinanzeigen.de' + href : "");
                    
                    if (title && itemUrl) {
                        const location = card.querySelector('.aditem-main--top')?.innerText?.trim() ?? "";
                        const middleText = card.querySelector('.aditem-main--middle')?.innerText?.trim() ?? "";
                        const image = card.querySelector('img')?.src ?? ""; // .aditem-image img
                        list.push({ title, middleText, location, url: itemUrl, image });
                    }
                });
                return list;
            });

            if (offersOnPage.length === 0 && pageNum > 1) {
                console.log(`Keine weiteren Angebote auf Seite ${pageNum} gefunden.`);
                break;
            }
            allOffers = allOffers.concat(offersOnPage);
            if (offersOnPage.length < 20 && pageNum > 1) { 
                console.log(`Weniger als 20 Angebote auf Seite ${pageNum}, möglicherweise Ende der Ergebnisse.`);
            }
        }

        const uniqueOffersMap = new Map();
        allOffers.forEach(offer => {
            if (offer.url && !uniqueOffersMap.has(offer.url)) {
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
                offersList.forEach(o => o.score = 0); // Oder einen Standardscore, z.B. 50, wenn nur ein Angebot
            }
        };

        assignScore(gpuOffers);
        assignScore(otherOffers);

        const remaining = finalOffers.filter(o => o.price === 0);
        remaining.forEach(o => o.score = 0); // Kein Preis, kein Score

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
        currentScraping.abort();
        res.json({ message: 'Suche wird abgebrochen.' });
    } else {
        res.status(404).json({ message: 'Keine aktive Suche zum Abbrechen vorhanden.' });
    }
});
app.use(express.json()); // Falls noch nicht vorhanden

app.post('/login', (req, res) => {
    const { code } = req.body;

    if (!code || typeof code !== 'string' || code.length !== 8) {
        return res.status(400).json({ success: false, message: "Ungültiger Code." });
    }

    if (validCodes.includes(code)) {
        return res.json({ success: true });
    } else {
        return res.status(401).json({ success: false, message: "Zugang verweigert." });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});