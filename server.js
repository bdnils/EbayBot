const express = require('express');
const { chromium } = require('playwright');
const session = require('express-session'); // Hinzugefügt für Sessions
const app = express();
const PORT = 3000;
const db = require('./db'); // Datenbankverbindung importieren
// const validCodes = require('./users'); // Ersetzt durch Datenbanklogik

app.use(express.json()); // Middleware für JSON-Request-Bodies

// Session-Middleware konfigurieren
app.use(session({
    secret: 'DeinSuperGeheimesSessionGeheimnis123!', // ÄNDERE DIES!
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Für Entwicklung (HTTP). Für Produktion (HTTPS) auf 'true' setzen!
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 Tag
    }
}));

// Middleware zur Überprüfung, ob der Nutzer angemeldet ist
function ensureAuthenticated(req, res, next) {
    if (req.session.isAuthenticated && req.session.userId) {
        return next();
    }
    res.status(401).json({ success: false, message: 'Nicht authentifiziert. Bitte zuerst anmelden.' });
}

// Statische Dateien (HTML, CSS, Frontend-JS) aus 'public' bereitstellen
app.use(express.static('public'));

// --- Authentifizierungs-Endpunkte ---
app.post('/login', async (req, res) => {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
        return res.status(400).json({ success: false, message: "Ungültiger Code-Typ." });
    }

    try {
        // Prüfe, ob der Code einem Benutzer in der DB entspricht (username = code)
        const [users] = await db.execute('SELECT id, username FROM users WHERE username = ?', [code]);
        if (users.length > 0) {
            const user = users[0];
            req.session.isAuthenticated = true;
            req.session.userCode = user.username; // Behalten für Konsistenz, falls verwendet
            req.session.userId = user.id;     // Wichtig für weitere DB-Operationen
            console.log(`Benutzer mit ID ${user.id} (Code ${user.username}) erfolgreich angemeldet.`);
            res.json({ success: true, message: 'Anmeldung erfolgreich.', userId: user.id, username: user.username });
        } else {
            console.log(`Fehlgeschlagener Anmeldeversuch mit Code: ${code}`);
            res.status(401).json({ success: false, message: 'Ungültiger Code oder Benutzer nicht gefunden.' });
        }
    } catch (error) {
        console.error('Login-Fehler:', error);
        res.status(500).json({ success: false, message: 'Serverfehler beim Login.' });
    }
});

app.get('/logout', (req, res) => {
    const userCode = req.session.userCode;
    const userId = req.session.userId;
    req.session.destroy(err => {
        if (err) {
            console.error('Fehler beim Abmelden:', err);
            return res.status(500).json({ success: false, message: 'Abmeldung fehlgeschlagen.' });
        }
        res.clearCookie('connect.sid'); // Name des Session-Cookies (Standardname)
        console.log(`Benutzer mit ID ${userId || '(unbekannt)'} (Code ${userCode || '(unbekannt)'}) abgemeldet.`);
        res.json({ success: true, message: 'Erfolgreich abgemeldet.' });
    });
});

// Endpunkt zur Überprüfung des Login-Status
app.get('/api/auth-status', (req, res) => {
    if (req.session.isAuthenticated && req.session.userId) {
        res.json({
            success: true,
            isAuthenticated: true,
            userId: req.session.userId,
            username: req.session.userCode // oder username, je nachdem was das Frontend erwartet
        });
    } else {
        res.json({ success: true, isAuthenticated: false });
    }
});


// --- Endpunkte zum Speichern und Laden von Suchen ---
app.post('/api/saved-searches', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    const {
        search_name, query, pages, plz, radius,
        exclude_words, min_price, price_limit, // price_limit ist maxPrice
        category_slug, category_id
    } = req.body;

    if (!search_name) {
        return res.status(400).json({ success: false, message: 'Suchname ist erforderlich.' });
    }

    try {
        const [result] = await db.execute(
            `INSERT INTO saved_searches (user_id, search_name, query, pages, plz, radius, exclude_words, min_price, price_limit, category_slug, category_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, search_name, query, pages, plz, radius, exclude_words, min_price, price_limit, category_slug, category_id]
        );
        res.status(201).json({ success: true, message: 'Suche gespeichert.', searchId: result.insertId });
    } catch (error) {
        console.error('Fehler beim Speichern der Suche:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Speichern der Suche.' });
    }
});

app.get('/api/saved-searches', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    try {
        const [searches] = await db.execute(
            'SELECT id, search_name, query, pages, plz, radius, exclude_words, min_price, price_limit, category_slug, category_id, created_at FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        res.json({ success: true, searches });
    } catch (error) {
        console.error('Fehler beim Laden der Suchen:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Suchen.' });
    }
});

app.delete('/api/saved-searches/:id', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    const searchId = req.params.id;
    try {
        const [result] = await db.execute(
            'DELETE FROM saved_searches WHERE id = ? AND user_id = ?',
            [searchId, userId]
        );
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Suche gelöscht.' });
        } else {
            res.status(404).json({ success: false, message: 'Suche nicht gefunden oder keine Berechtigung.' });
        }
    } catch (error) {
        console.error('Fehler beim Löschen der Suche:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Löschen der Suche.' });
    }
});


// --- Scraping-Funktionen und Endpunkte ---
let currentScraping = null; // Bezieht sich auf manuelle Scrapes

const locationMap = {
    "46485": "1866",
    "46483": "1867",
    "46514": "1756",
    "46487": "1868",
};

function extractPrice(text) {
    if (typeof text !== 'string') return null;
    const match = text.match(/([\d.,]+)\s*€/); // Angepasst für deutsche Zahlenformate
    if (match && match[1]) {
        let numberString = match[1];
        numberString = numberString.replace(/\./g, ''); // Tausendertrennzeichen (Punkte) entfernen
        numberString = numberString.replace(/,/g, '.');  // Dezimalkomma durch Punkt ersetzen
        const price = parseFloat(numberString);
        return isNaN(price) ? null : price;
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

app.get('/scrape', ensureAuthenticated, async (req, res) => {
    if (currentScraping && !(req.query.auto === 'true')) { // auto-Parameter für spätere Erweiterungen
        return res.status(409).json({ message: 'Eine Suche läuft bereits.' });
    }

    const abortController = new AbortController();
    if (!(req.query.auto === 'true')) {
        currentScraping = abortController;
    }
    const { userId } = req.session; // Benutzer-ID für das Speichern von Ergebnissen

    const query = req.query.query || "grafikkarte";
    const searchQuery = query.trim().replace(/\s+/g, '-');
    const pagesToScrape = Math.min(parseInt(req.query.pages) || 10, 50);

    const plz = req.query.plz;
    const radius = req.query.radius;
    let ortId = null;

    if (plz) {
        ortId = locationMap[plz];
        if (!ortId) {
            if (!(req.query.auto === 'true')) currentScraping = null;
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

    const categorySlug = req.query.categorySlug;
    const categoryId = req.query.categoryId;

    // Parameter für das Speichern von Ergebnissen
    const saveResults = req.query.saveResults === 'true';
    const sessionName = req.query.sessionName || `Scrape vom ${new Date().toLocaleString()}`;


    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, wie Gecko) Chrome/123 Safari/537.36'
        });
        const page = await context.newPage();
        let allOffers = [];
        let finalUrl;

        for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {
            if (abortController.signal.aborted) {
                console.log('Suche wurde extern abgebrochen.');
                break;
            }

            let currentUrlPath = "";
            if (categorySlug && categoryId) {
                currentUrlPath = `s-${categorySlug}`;
                if (plz && ortId) currentUrlPath += `/${plz}`;
                if (pageNum > 1) currentUrlPath += `/seite:${pageNum}`;
                if (preisSegment) currentUrlPath += preisSegment;
                currentUrlPath += `/${searchQuery}`;
                currentUrlPath += `/k0c${categoryId}`;
                if (ortId) {
                    currentUrlPath += `l${ortId}`;
                    if (radius) currentUrlPath += `r${radius}`;
                }
                finalUrl = `https://www.kleinanzeigen.de/${currentUrlPath}`;
            } else {
                let legacyPath = "";
                if (plz && ortId) legacyPath += plz;
                if (pageNum > 1) {
                    if (legacyPath.length > 0) legacyPath += "/";
                    legacyPath += `seite:${pageNum}`;
                }
                if (preisSegment) {
                    if (legacyPath.length > 0) legacyPath += preisSegment;
                    else legacyPath += preisSegment.substring(1);
                }
                if (legacyPath.length > 0 && !legacyPath.endsWith('/')) legacyPath += "/";
                legacyPath += searchQuery;
                legacyPath += "/k0";
                if (ortId) {
                    legacyPath += `l${ortId}`;
                    if (radius) legacyPath += `r${radius}`;
                }
                finalUrl = `https://www.kleinanzeigen.de/s-${legacyPath}`;
            }
            
            console.log(`User ${userId} lädt Seite ${pageNum}: ${finalUrl}`);

            try {
                await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            } catch (err) {
                if (abortController.signal.aborted) {
                    console.log('Timeout beim Laden, aber Suche bereits abgebrochen.');
                    break;
                } else if (err.name === 'TimeoutError') {
                    console.warn(`Timeout Seite ${pageNum}: ${finalUrl}. Überspringe...`);
                    continue;
                } else {
                    throw err;
                }
            }

            if (abortController.signal.aborted) break;
            await page.waitForTimeout(1500 + Math.random() * 1000); // Etwas Wartezeit
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
                        const image = card.querySelector('img')?.src ?? "";
                        list.push({ title, middleText, location, url: itemUrl, image });
                    }
                });
                return list;
            });

            if (offersOnPage.length === 0 && pageNum > 1) {
                console.log(`Keine weiteren Angebote auf Seite ${pageNum}.`);
                break;
            }
            allOffers = allOffers.concat(offersOnPage);
            if (offersOnPage.length < 20 && pageNum > 1) {
                console.log(`Weniger als 20 Angebote auf Seite ${pageNum}, evtl. Ende.`);
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

        let finalOffersProcessed = filteredOffers.map(offer => { // Umbenannt, um Verwechslung zu vermeiden
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

        const gpuOffers = finalOffersProcessed.filter(o => o.price > 0 && isGraphicCardOffer(o.title));
        const otherOffers = finalOffersProcessed.filter(o => o.price > 0 && !isGraphicCardOffer(o.title));

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

        const remaining = finalOffersProcessed.filter(o => o.price === 0);
        remaining.forEach(o => o.score = 0);

        const allSorted = [...gpuOffers, ...otherOffers, ...remaining].sort((a, b) => b.score - a.score);

        // Ergebnisse speichern, wenn gewünscht
        if (saveResults && allSorted.length > 0) {
            console.log(`Speichere ${allSorted.length} Ergebnisse für User ${userId} unter Session "${sessionName}"...`);
            let currentSessionDbId = null; // ID der DB-Session-Zeile
            try {
                const [sessionResult] = await db.execute(
                    'INSERT INTO scraped_offers_sessions (user_id, session_name) VALUES (?, ?)',
                    [userId, sessionName]
                );
                currentSessionDbId = sessionResult.insertId;

                for (const offer of allSorted) {
                    await db.execute(
                        `INSERT INTO scraped_offers_results (session_id, user_id, title, price, price_type, location, url, image_url)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE price=VALUES(price), price_type=VALUES(price_type), scraped_at=CURRENT_TIMESTAMP`, // Bei Duplikat (URL) aktualisieren
                        [currentSessionDbId, userId, offer.title, offer.price, offer.priceType, offer.location, offer.url, offer.image]
                    );
                }
                console.log("Speichern der Ergebnisse abgeschlossen.");
            } catch (dbError) {
                console.error("Fehler beim Speichern der Scraping-Ergebnisse in DB:", dbError);
            }
        }
        res.json(allSorted);

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
        if (!(req.query.auto === 'true')) {
            currentScraping = null;
        }
        console.log('Scraping-Vorgang beendet und Ressourcen freigegeben.');
    }
});

// Endpunkt zum Abbrechen einer laufenden Suche
app.post('/cancel', ensureAuthenticated, (req, res) => {
    if (currentScraping) {
        console.log(`Nutzer ${req.session.userId} bricht Suche ab...`);
        currentScraping.abort();
        res.json({ message: 'Suche wird abgebrochen.' });
    } else {
        res.status(404).json({ message: 'Keine aktive Suche zum Abbrechen vorhanden.' });
    }
});

// Serverstart
app.listen(PORT, () => {
    console.log(`✅ Server läuft auf http://localhost:${PORT}`);
});