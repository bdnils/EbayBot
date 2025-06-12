// server.js (Vervollständigt, wo möglich)
const express = require('express');
const { chromium } = require('playwright');
const session = require('express-session');
const cron = require('node-cron'); // Für geplante Aufgaben
const crypto = require('crypto'); // Für URL-Hashing
const app = express();
const PORT = 3000;
const db = require('./db'); // Stelle sicher, dass db.js korrekt konfiguriert ist
// In server.js, am Anfang der Datei
const nodemailer = require('nodemailer');

// Konfiguration für den E-Mail-Versand
const transporter = nodemailer.createTransport({
    host: "smtp.sendgrid.net", // z.B. "smtp.gmail.com"
    port: 587, // oder 465 für SSL
    secure: false, // true für port 465, false für andere
    auth: {
        user: "apikey", // Deine E-Mail-Adresse
        pass: "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", // Dein Passwort
    },
});

// Globale Funktion zum Senden von E-Mails
async function sendEmailNotification(recipientEmail, subject, htmlContent) {
    if (!recipientEmail) {
        console.log("E-Mail-Versand übersprungen: Keine Empfänger-E-Mail angegeben.");
        return;
    }
    try {
        let info = await transporter.sendMail({
            from: '"nexoboy55@gmail.com',
            to: recipientEmail,
            subject: subject,
            html: htmlContent,
        });
        console.log("E-Mail erfolgreich gesendet an:", recipientEmail, "Message ID:", info.messageId);
    } catch (error) {
        console.error("Fehler beim Senden der E-Mail an", recipientEmail, ":", error);
    }
}
app.use(express.json());
app.use(session({
    secret: 'DeinSuperGeheimesSessionGeheimnis123!', // ÄNDERE DIES IN EINEN LANGEN, ZUFÄLLIGEN STRING!
    resave: false,
    saveUninitialized: true, // Session auch ohne Login-Daten erstellen (aber noch nicht authentifiziert)
    cookie: {
        secure: false, // Für Entwicklung (HTTP). Für Produktion (HTTPS) auf 'true' setzen!
        httpOnly: true, // Verhindert Zugriff auf Cookie per JavaScript im Browser
        maxAge: 24 * 60 * 60 * 1000 // Gültigkeit des Cookies (hier 1 Tag)
    }
}));

// Middleware zur Überprüfung, ob der Nutzer angemeldet ist
function ensureAuthenticated(req, res, next) {
    if (req.session.isAuthenticated && req.session.userId) {
        return next();
    }
    res.status(401).json({ success: false, message: 'Nicht authentifiziert. Bitte zuerst anmelden.' });
}

app.use(express.static('public'));

// --- Authentifizierungs-Endpunkte ---
app.post('/login', async (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ success: false, message: "Ungültiger Code-Typ." });
    }
    try {
        const [users] = await db.execute('SELECT id, username FROM users WHERE username = ?', [code]);
        if (users.length > 0) {
            const user = users[0];
            req.session.isAuthenticated = true;
            req.session.userCode = user.username;
            req.session.userId = user.id;
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
        res.clearCookie('connect.sid');
        console.log(`Benutzer mit ID ${userId || '(unbekannt)'} (Code ${userCode || '(unbekannt)'}) abgemeldet.`);
        res.json({ success: true, message: 'Erfolgreich abgemeldet.' });
    });
});

app.get('/api/auth-status', (req, res) => {
    if (req.session.isAuthenticated && req.session.userId) {
        res.json({
            success: true,
            isAuthenticated: true,
            userId: req.session.userId,
            username: req.session.userCode
        });
    } else {
        res.json({ success: true, isAuthenticated: false });
    }
});

// --- Endpunkte zum Speichern und Laden von (manuellen) Suchen ---
// --- Endpunkte zum Speichern und Laden von (manuellen) Suchen ---

// GEÄNDERT: Nimmt jetzt die neuen Auto-Filter entgegen und speichert sie.
// GEÄNDERT: Stellt sicher, dass keine 'undefined' Werte an die Datenbank übergeben werden.

// --- Endpunkte zum Speichern und Laden von (manuellen) Suchen ---

app.post('/api/saved-searches', ensureAuthenticated, async (req, res) => {
    console.log("--- POST /api/saved-searches ---"); // NEU
    console.log("Schritt 1: Anfrage zum Speichern erhalten."); // NEU
    const { userId } = req.session;
    
    const {
        search_name, query, pages, plz, radius, exclude_words, min_price, 
        price_limit, category_slug, category_id, category_name, km_min, 
        km_max, ez_min, ez_max, power_min, power_max, tuev_min
    } = req.body;

    if (!search_name) {
        console.log("Fehler: Suchname fehlt."); // NEU
        return res.status(400).json({ success: false, message: 'Suchname ist erforderlich.' });
    }

    try {
        const sql = `
            INSERT INTO saved_searches (
                user_id, search_name, query, pages, plz, radius, exclude_words, min_price, 
                price_limit, category_slug, category_id, category_name, km_min, km_max, 
                ez_min, ez_max, power_min, power_max, tuev_min
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            userId, search_name, query, pages, plz, radius, exclude_words, min_price || null,
            price_limit || null, category_slug || null, category_id || null, category_name || null,
            km_min || null, km_max || null, ez_min || null, ez_max || null,
            power_min || null, power_max || null, tuev_min || null
        ];

        console.log("Schritt 2: Führe jetzt die Datenbank-Abfrage zum Speichern aus..."); // NEU
        const [result] = await db.execute(sql, values);
        console.log("Schritt 3: Datenbank-Abfrage erfolgreich ausgeführt!"); // NEU
        
        res.status(201).json({ success: true, message: 'Suche gespeichert.', searchId: result.insertId });

    } catch (error) {
        console.error('!!! Schwerer Fehler beim Speichern der Suche:', error); // NEU
        res.status(500).json({ success: false, message: 'Serverfehler beim Speichern der Suche.' });
    }
});

app.get('/api/saved-searches', ensureAuthenticated, async (req, res) => {
    console.log("--- GET /api/saved-searches ---"); // NEU
    console.log("Schritt 1: Anfrage zum Laden der Liste erhalten."); // NEU
    const { userId } = req.session;
    try {
        const sql = `
            SELECT 
                id, search_name, query, pages, plz, radius, exclude_words, min_price, 
                price_limit, category_slug, category_id, category_name, created_at,
                km_min, km_max, ez_min, ez_max, power_min, power_max, tuev_min
            FROM saved_searches 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `;
        
        console.log("Schritt 2: Führe jetzt die Datenbank-Abfrage zum Laden aus..."); // NEU
        const [searches] = await db.execute(sql, [userId]);
        console.log(`Schritt 3: Datenbank-Abfrage erfolgreich! ${searches.length} Suchen gefunden.`); // NEU
        
        res.json({ success: true, searches });
    } catch (error) {
        console.error('!!! Schwerer Fehler beim Laden der Suchen:', error); // NEU
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Suchen.' });
    }
});
// UNVERÄNDERT: Dieser Endpunkt bleibt gleich.
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


// --- API Endpunkte für überwachte Suchen (Dashboard) ---
app.post('/api/monitored-searches', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    const { search_name, query_params } = req.body;

    if (!search_name || !query_params) {
        return res.status(400).json({ success: false, message: 'Name und Suchparameter sind erforderlich.' });
    }
    try {
        const queryParamsString = JSON.stringify(query_params); // Frontend schickt Objekt, wir speichern als JSON-String
        const [result] = await db.execute(
            'INSERT INTO monitored_searches (user_id, search_name, query_params) VALUES (?, ?, ?)',
            [userId, search_name, queryParamsString]
        );
        res.status(201).json({ success: true, message: 'Überwachte Suche hinzugefügt.', id: result.insertId });
    } catch (error) {
        console.error('Fehler beim Hinzufügen der überwachten Suche:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Hinzufügen.' });
    }
});

app.get('/api/monitored-searches', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    try {
        const [searches] = await db.execute(
            'SELECT id, search_name, query_params, is_active, last_checked_at, last_found_count FROM monitored_searches WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        const parsedSearches = searches.map(s => {
            try {
                return {...s, query_params: JSON.parse(s.query_params)};
            } catch (e) {
                console.error(`Fehler beim Parsen von query_params für Monitor ID ${s.id}:`, s.query_params);
                return {...s, query_params: {}}; // Fallback auf leeres Objekt
            }
        });
        res.json({ success: true, searches: parsedSearches });
    } catch (error) {
        console.error('Fehler beim Laden der überwachten Suchen:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden.' });
    }
});

app.put('/api/monitored-searches/:id/toggle', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    const { id } = req.params;
    try {
        const [current] = await db.execute('SELECT is_active FROM monitored_searches WHERE id = ? AND user_id = ?', [id, userId]);
        if (current.length === 0) {
            return res.status(404).json({ success: false, message: 'Überwachte Suche nicht gefunden.' });
        }
        const newStatus = !current[0].is_active;
        await db.execute(
            'UPDATE monitored_searches SET is_active = ? WHERE id = ? AND user_id = ?',
            [newStatus, id, userId]
        );
        res.json({ success: true, message: `Überwachung ${newStatus ? 'aktiviert' : 'deaktiviert'}.`, isActive: newStatus });
    } catch (error) {
        console.error('Fehler beim Umschalten der überwachten Suche:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Umschalten.' });
    }
});

app.delete('/api/monitored-searches/:id', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    const { id } = req.params;
    try {
        const [result] = await db.execute(
            'DELETE FROM monitored_searches WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        if (result.affectedRows > 0) {
            // Zugehörige Einträge in seen_monitored_offers werden durch ON DELETE CASCADE in der DB gelöscht
            // Zugehörige Notifications werden durch ON DELETE SET NULL in der DB aktualisiert (monitored_search_id = NULL)
            res.json({ success: true, message: 'Überwachte Suche gelöscht.' });
        } else {
            res.status(404).json({ success: false, message: 'Nicht gefunden oder keine Berechtigung.' });
        }
    } catch (error) {
        console.error('Fehler beim Löschen der überwachten Suche:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Löschen.' });
    }
});


// --- API Endpunkte für Benachrichtigungen (Postfach) ---
app.get('/api/notifications', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    try {
        const [notifications] = await db.execute(
            'SELECT id, monitored_search_id, offer_title, offer_url, offer_price, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', // Limit erhöht
            [userId]
        );
        const [unreadCountResult] = await db.execute(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        res.json({ success: true, notifications, unreadCount: unreadCountResult[0].count });
    } catch (error) {
        console.error('Fehler beim Laden der Benachrichtigungen:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Laden der Benachrichtigungen.' });
    }
});

app.put('/api/notifications/:id/read', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    const { id } = req.params;
    try {
        await db.execute(
            'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        res.json({ success: true, message: 'Benachrichtigung als gelesen markiert.' });
    } catch (error) {
        console.error('Fehler beim Markieren als gelesen:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Markieren.' });
    }
});

app.put('/api/notifications/read-all', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;
    try {
        await db.execute(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        res.json({ success: true, message: 'Alle neuen Benachrichtigungen als gelesen markiert.' });
    } catch (error) {
        console.error('Fehler beim Markieren aller als gelesen:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Markieren.' });
    }
});


// --- Scraping-Helferfunktionen ---
const locationMap = {
    "46485": "1866", "46483": "1867", "46514": "1756", "46487": "1868",
    // Füge hier alle deine PLZ-Mappings hinzu
};

function extractPrice(text) {
    if (typeof text !== 'string') return null;
    const match = text.match(/([\d.,]+)\s*€/);
    if (match && match[1]) {
        let numberString = match[1];
        numberString = numberString.replace(/\./g, ''); // Tausenderpunkte entfernen
        numberString = numberString.replace(/,/g, '.');  // Dezimalkomma zu Punkt
        const price = parseFloat(numberString);
        return isNaN(price) ? null : price;
    }
    return null;
}

function extractPriceType(text) {
    if (typeof text !== 'string') return "unbekannt";
    if (text.toLowerCase().includes("vb")) {
        return "VB";
    }
    return "Festpreis";
}

function isGraphicCardOffer(title) {
    if (typeof title !== 'string') return false;
    const titleLower = title.toLowerCase();
    const include = ["grafikkarte", "gpu", "geforce", "gtx", "rtx", "rx", "radeon", "intel arc", "a750", "a770", "arc a"];
    return include.some(word => titleLower.includes(word));
}

// Die Haupt-Scraping-Funktion, jetzt modularer für Cronjobs
// In server.js

async function performScrape(scrapeParams, userForNotification = null, monitoredSearchIdForNotification = null) {
    // KORREKTUR: Verwendet userForNotification?.id für eine saubere Log-Ausgabe
    console.log(`Starte Scrape mit Parametern:`, scrapeParams, `Für UserNotification: ${userForNotification?.id}, MonitorID: ${monitoredSearchIdForNotification}`);

    const {
        query = "grafikkarte", pages = 1, plz, radius,
        minPrice, priceLimit, excludeWords: rawExcludes = '',
        categoryId, categorySlug, kmMin, kmMax, ezMin, ezMax, powerMin, powerMax, tuevMin
    } = scrapeParams;

    const searchQuery = query.trim().replace(/\s+/g, '-');
    
    // KORREKTUR: Hier wird jetzt geprüft, ob das userForNotification-Objekt existiert
    const pagesToScrape = userForNotification ? Math.min(parseInt(pages) || 1, 2) : Math.min(parseInt(pages) || 10, 50);
    
    const excludedWordsArray = typeof rawExcludes === 'string' ? rawExcludes.split(',').map(w => w.trim().toLowerCase()).filter(Boolean) : [];
    
    let ortId = null;
    if (plz && locationMap[plz]) {
        ortId = locationMap[plz];
    } else if (plz) {
        console.warn(`(PerformScrape) Unbekannte PLZ ${plz} für Scrape. Ort wird ignoriert.`);
    }

    let preisSegment = '';
    if (minPrice != null && priceLimit != null) preisSegment = `/preis:${minPrice}:${priceLimit}`;
    else if (minPrice != null) preisSegment = `/preis:${minPrice}:`;
    else if (priceLimit != null) preisSegment = `/preis::${priceLimit}`;

    let carParamsSegment = '';
    if (categorySlug === 'autos') {
        const carParams = [];
        if (kmMin || kmMax) carParams.push(`autos.km_i:${kmMin || ''},${kmMax || ''}`);
        if (ezMin || ezMax) carParams.push(`autos.ez_i:${ezMin || ''},${ezMax || ''}`);
        if (powerMin || powerMax) carParams.push(`autos.power_i:${powerMin || ''},${powerMax || ''}`);
        if (tuevMin) carParams.push(`autos.tuevy_i:${tuevMin},`);
        if (carParams.length > 0) carParamsSegment = '+' + carParams.join('+');
    }

    let allScrapedOffers = [];
    let browser = null;

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, wie Gecko) Chrome/124.0.0.0 Safari/537.36', javaScriptEnabled: true });
        const page = await context.newPage();

        for (let pageNum = 1; pageNum <= pagesToScrape; pageNum++) {
            let currentUrlPath = "";
            if (categorySlug && categoryId) {
                currentUrlPath = `s-${categorySlug}`;
                if (plz && ortId) currentUrlPath += `/${plz}`;
                if (pageNum > 1) currentUrlPath += `/seite:${pageNum}`;
                if (preisSegment) currentUrlPath += preisSegment;
                currentUrlPath += `/${searchQuery}`;
                currentUrlPath += `/k0c${categoryId}${carParamsSegment}`;
                if (ortId) { currentUrlPath += `l${ortId}`; if (radius) currentUrlPath += `r${radius}`; }
            } else {
                let legacyPath = "";
                if (plz && ortId) legacyPath += plz;
                if (pageNum > 1) { if (legacyPath.length > 0) legacyPath += "/"; legacyPath += `seite:${pageNum}`; }
                if (preisSegment) { if (legacyPath.length > 0) legacyPath += preisSegment; else legacyPath += preisSegment.substring(1); }
                if (legacyPath.length > 0 && !legacyPath.endsWith('/')) legacyPath += "/";
                legacyPath += searchQuery; legacyPath += "/k0";
                if (ortId) { legacyPath += `l${ortId}`; if (radius) legacyPath += `r${radius}`; }
                currentUrlPath = legacyPath;
            }
            const finalUrl = `https://www.kleinanzeigen.de/${currentUrlPath.startsWith('s-') ? currentUrlPath : 's-' + currentUrlPath}`;
            
            console.log(`(PerformScrape) Lade Seite ${pageNum}: ${finalUrl}`);
            try {
                await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch(e) {
                console.error(`Fehler beim Laden von ${finalUrl} auf Seite ${pageNum}: ${e.message}`);
                if(pageNum === 1 && e.message.includes('timeout')) throw e;
                continue;
            }
            await page.waitForTimeout(2500 + Math.random() * 2000);

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
                        const imageElement = card.querySelector('.imagebox img');
                        const image = imageElement?.getAttribute('src') ?? imageElement?.dataset.imgsrc ?? "";
                        list.push({ title, middleText, location, url: itemUrl, image });
                    }
                });
                return list;
            });
            if (offersOnPage.length === 0 && pageNum > 1) break;
            allScrapedOffers.push(...offersOnPage);
            
            // KORREKTUR: Hier wird jetzt geprüft, ob das userForNotification-Objekt existiert
            if (userForNotification && offersOnPage.length < 20 && pageNum > 1) break;
            if (userForNotification && offersOnPage.length === 0 && pageNum === 1) break;
        }
    } catch(error) {
        console.error(`(PerformScrape) Schwerer Fehler während des Playwright-Vorgangs: ${error.message}`);
        throw error;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error("(PerformScrape) Fehler beim Schließen des Browsers:", e);
            }
        }
    }

    const uniqueOffersMap = new Map();
    allScrapedOffers.forEach(offer => { if (offer.url && !uniqueOffersMap.has(offer.url)) uniqueOffersMap.set(offer.url, offer); });
    
    let processedOffers = Array.from(uniqueOffersMap.values())
        .filter(offer => !excludedWordsArray.some(keyword => offer.title.toLowerCase().includes(keyword)))
        .map(offer => {
            const price = extractPrice(offer.middleText);
            const priceType = extractPriceType(offer.middleText);
            return { title: offer.title, price: price ?? 0, priceType: price || price===0 ? priceType : "unbekannt", location: offer.location, url: offer.url, image: offer.image };
        });

    if (userForNotification && monitoredSearchIdForNotification) {
        let newFoundOffersForNotification = [];
        for (const offer of processedOffers) {
            const urlHash = crypto.createHash('sha256').update(offer.url).digest('hex');
            try {
                const [seenResult] = await db.execute(
                    'INSERT IGNORE INTO seen_monitored_offers (monitored_search_id, offer_url_hash) VALUES (?, ?)',
                    [monitoredSearchIdForNotification, urlHash]
                );
                if (seenResult.affectedRows > 0) {
                    newFoundOffersForNotification.push(offer);
                }
            } catch (e) {
                if (e.code !== 'ER_DUP_ENTRY') console.error("DB Fehler bei seen_monitored_offers:", e);
            }
        }

        if (newFoundOffersForNotification.length > 0) {
            console.log(`${newFoundOffersForNotification.length} neue Angebote für überwachte Suche ID ${monitoredSearchIdForNotification} (User ${userForNotification.id}) gefunden.`);
            
            let emailHtml = `<h1>Neue Angebote für deine Suche "${scrapeParams.search_name}"</h1><ul>`;
            
            for (const newOffer of newFoundOffersForNotification) {
                try {
                    await db.execute(
                        'INSERT INTO notifications (user_id, monitored_search_id, offer_title, offer_url, offer_price) VALUES (?, ?, ?, ?, ?)',
                        [userForNotification.id, monitoredSearchIdForNotification, newOffer.title.substring(0, 254), newOffer.url, `${newOffer.price} ${newOffer.priceType}`.substring(0, 99)]
                    );
                    emailHtml += `<li><a href="${newOffer.url}" target="_blank">${newOffer.title}</a> - <strong>${newOffer.price > 0 ? newOffer.price + '€' : 'VB'}</strong></li>`;
                } catch (e) { console.error("DB Fehler beim Erstellen der Notification:", e); }
            }
            emailHtml += `</ul>`;
            
            if (scrapeParams.last_checked_at) {
                await sendEmailNotification(
                    userForNotification.email, 
                    `Neue Angebote gefunden: ${scrapeParams.search_name}`, 
                    emailHtml
                );
            } else {
                console.log(`Erster Check für Suche ID ${monitoredSearchIdForNotification}, keine E-Mail-Benachrichtigung gesendet.`);
            }
        }
        await db.execute('UPDATE monitored_searches SET last_checked_at = CURRENT_TIMESTAMP, last_found_count = ? WHERE id = ?', [processedOffers.length, monitoredSearchIdForNotification]);
    }
    return processedOffers;
}

// In server.js

// NEU: Endpunkt zum Abrufen der Benutzerprofildaten
app.get('/api/profile', ensureAuthenticated, async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT username, role, email, telegram_user FROM users WHERE id = ?',
            [req.session.userId]
        );
        if (users.length > 0) {
            res.json({ success: true, profile: users[0] });
        } else {
            res.status(404).json({ success: false, message: 'Benutzer nicht gefunden.' });
        }
    } catch (error) {
        console.error('Fehler beim Laden des Profils:', error);
        res.status(500).json({ success: false, message: 'Serverfehler beim Laden des Profils.' });
    }
});

// NEU: Endpunkt zum Speichern der Benutzerprofildaten
app.post('/api/profile', ensureAuthenticated, async (req, res) => {
    const { email, telegramUser } = req.body;

    // Einfache Validierung
    if (typeof email !== 'string' || typeof telegramUser !== 'string') {
        return res.status(400).json({ success: false, message: 'Ungültige Daten.' });
    }

    try {
        await db.execute(
            'UPDATE users SET email = ?, telegram_user = ? WHERE id = ?',
            [email, telegramUser, req.session.userId]
        );
        res.json({ success: true, message: 'Profil erfolgreich gespeichert!' });
    } catch (error) {
        console.error('Fehler beim Speichern des Profils:', error);
        res.status(500).json({ success: false, message: 'Serverfehler beim Speichern des Profils.' });
    }
});


// Angepasster /scrape Endpunkt
let activeUserScrapes = {};

app.get('/scrape', ensureAuthenticated, async (req, res) => {
    const { userId } = req.session;

    if (activeUserScrapes[userId]) {
        return res.status(409).json({ message: 'Eine Suche für Sie läuft bereits.' });
    }
    activeUserScrapes[userId] = true;
    
    try {
        // GEÄNDERT: Die neuen Parameter aus req.query auslesen
        const scrapeParams = {
            query: req.query.query,
            pages: req.query.pages,
            plz: req.query.plz,
            radius: req.query.radius,
            minPrice: req.query.minPrice,
            priceLimit: req.query.priceLimit,
            excludeWords: req.query.excludeWords,
            categoryId: req.query.categoryId,
            categorySlug: req.query.categorySlug,
            // NEU: Parameter für die Autosuche an das scrapeParams-Objekt übergeben
            kmMin: req.query.kmMin,
            kmMax: req.query.kmMax,
            ezMin: req.query.ezMin,
            ezMax: req.query.ezMax,
            powerMin: req.query.powerMin,
            powerMax: req.query.powerMax,
            tuevMin: req.query.tuevMin
        };

        const processedOffers = await performScrape(scrapeParams);

        const gpuOffers = processedOffers.filter(o => o.price > 0 && isGraphicCardOffer(o.title));
        const otherOffers = processedOffers.filter(o => o.price > 0 && !isGraphicCardOffer(o.title));
        const assignScore = (list) => { if(list.length>1){const p=list.map(o=>o.price); const min=Math.min(...p),max=Math.max(...p); list.forEach(o=>o.score=(max!==min)?Math.round(((max-o.price)/(max-min))*100):0);}else{list.forEach(o=>o.score=0);}};
        assignScore(gpuOffers); assignScore(otherOffers);
        const remaining = processedOffers.filter(o => o.price === 0); remaining.forEach(o=>o.score=0);
        const allSorted = [...gpuOffers, ...otherOffers, ...remaining].sort((a,b) => b.score - a.score);

        if (req.query.saveResults === 'true' && allSorted.length > 0) {
            const sessionName = req.query.sessionName || `Manueller Scrape ${new Date().toLocaleString()}`;
            // HIER DEINE LOGIK ZUM SPEICHERN IN scraped_offers_sessions UND scraped_offers_results EINFÜGEN
            // Beispielhaft:
            try {
                const [sessionResult] = await db.execute(
                    'INSERT INTO scraped_offers_sessions (user_id, session_name) VALUES (?, ?)',
                    [userId, sessionName]
                );
                const currentSessionDbId = sessionResult.insertId;
                for (const offer of allSorted) {
                    await db.execute(
                        `INSERT INTO scraped_offers_results (session_id, user_id, title, price, price_type, location, url, image_url)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE price=VALUES(price), price_type=VALUES(price_type), scraped_at=CURRENT_TIMESTAMP`,
                        [currentSessionDbId, userId, offer.title, offer.price, offer.priceType, offer.location, offer.url, offer.image]
                    );
                }
                console.log(`Ergebnisse des manuellen Scrapes "${sessionName}" für User ${userId} gespeichert.`);
            } catch (dbError) {
                console.error("Fehler beim Speichern der manuellen Scrape-Ergebnisse:", dbError);
            }
        }
        res.json(allSorted);

    } catch (error) {
        console.error('Fehler während des Scrapings im /scrape Endpunkt:', error.message);
        res.status(500).json({ message: 'Fehler während des Scrapings.', error: error.message });
    } finally {
        delete activeUserScrapes[userId];
        console.log(`Manueller Scrape für User ${userId} beendet oder fehlgeschlagen.`);
    }
});

app.post('/cancel', ensureAuthenticated, (req, res) => {
    // Dieser Endpunkt ist schwierig umzusetzen, da der Playwright-Prozess, einmal gestartet,
    // schwer von außen "sauber" abzubrechen ist, ohne den Browser abrupt zu schließen.
    // Die req.on('close') im /scrape ist ein besserer Ansatz für Client-Disconnects.
    console.log(`Abbruchanfrage von User ${req.session.userId} für einen manuellen Scrape erhalten. Aktuell nicht direkt unterstützt, Scrape läuft ggf. weiter.`);
    res.status(510).json({ message: 'Abbruchanfrage empfangen, aber das direkte Abbrechen laufender serverseitiger Scrapes ist komplex. Der Scrape läuft ggf. zu Ende.' });
});


// In server.js

// --- Cronjob für überwachte Suchen ---
// In server.js

// KORRIGIERTER Cronjob-Block
cron.schedule('*/10 * * * *', async () => {
    console.log('⏰ Cronjob: Starte Überprüfung überwachter Suchen...');
    let activeMonitors = [];
    try {
        const query = `
            SELECT 
                ms.id, ms.user_id, ms.search_name, ms.query_params, ms.last_checked_at,
                u.email, u.telegram_user
            FROM monitored_searches ms
            JOIN users u ON ms.user_id = u.id
            WHERE ms.is_active = TRUE
        `;
        [activeMonitors] = await db.execute(query);
    } catch (dbError) {
        console.error('⏰ Cronjob: Fehler beim Abrufen aktiver Monitore aus DB:', dbError);
        return;
    }

    if (activeMonitors.length === 0) {
        console.log('⏰ Cronjob: Keine aktiven Überwachungen gefunden.');
        return;
    }

    console.log(`⏰ Cronjob: ${activeMonitors.length} aktive Überwachung(en) gefunden.`);

    for (const monitor of activeMonitors) {
        console.log(`⏰ Cronjob: Verarbeite Überwachung ID ${monitor.id} für User ID ${monitor.user_id}`);
        try {
            let queryParams = JSON.parse(monitor.query_params);
            
            // Füge die zusätzlichen Infos für die E-Mail zu den scrapeParams hinzu
            queryParams.search_name = monitor.search_name;
            queryParams.last_checked_at = monitor.last_checked_at;

            const userForNotification = {
                id: monitor.user_id,
                email: monitor.email,
                telegram_user: monitor.telegram_user
            };
            
            await performScrape(queryParams, userForNotification, monitor.id);
            console.log(`⏰ Cronjob: Überwachung ID ${monitor.id} erfolgreich abgeschlossen.`);

        } catch (scrapeError) {
            console.error(`⏰ Cronjob: Fehler bei der Ausführung von Überwachung ID ${monitor.id}: ${scrapeError.message}.`);
            try {
                await db.execute('UPDATE monitored_searches SET last_checked_at = CURRENT_TIMESTAMP WHERE id = ?', [monitor.id]);
            } catch (updateError) {
                console.error(`⏰ Cronjob: Fehler beim Aktualisieren von last_checked_at nach Fehler:`, updateError);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 20000 + Math.random() * 10000));
    }
    console.log('⏰ Cronjob: Alle aktiven Überwachungen für diesen Zyklus verarbeitet.');
});


app.listen(3000, '0.0.0.0', () => console.log('Server läuft auf Port 3000'));