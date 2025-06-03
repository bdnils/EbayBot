// Globale Variablen für die ausgewählte Kategorie
let selectedCategoryName = null;
let selectedCategorySlug = null;
let selectedCategoryId = null;

// Globale Variablen für Benutzerdaten (nach Login gefüllt)
let currentUserId = null;
let currentUsername = null;

let autoSearchIntervalId; // Geändert von autoSearchInterval, um Verwechslung mit der Input-ID zu vermeiden

// Hilfsfunktion für User-Nachrichten
function showUserMessage(message, type = 'success') {
    const msgContainer = document.getElementById('userMessages');
    if (!msgContainer) return;
    msgContainer.textContent = message;
    msgContainer.className = `user-messages ${type}`; // z.B. 'success' oder 'error' für Styling
    msgContainer.style.display = 'block';
    setTimeout(() => {
        msgContainer.style.display = 'none';
        msgContainer.textContent = '';
    }, 4000); // Nachricht nach 4 Sekunden ausblenden
}


window.addEventListener('DOMContentLoaded', async () => {
    // Überprüfe den Authentifizierungsstatus beim Laden der Seite
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();

        if (data.success && data.isAuthenticated) {
            currentUserId = data.userId;
            currentUsername = data.username;
            document.getElementById('usernameDisplay').textContent = `Angemeldet als: ${currentUsername}`;
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block'; // App anzeigen
            document.body.classList.remove('locked');
            loadSavedSearches(); // Gespeicherte Suchen laden
            initializeExcludeWords(); // Ausschlusswörter initialisieren
        } else {
            document.getElementById('loginOverlay').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none'; // App ausblenden
            document.body.classList.add('locked');
        }
    } catch (error) {
        console.error("Fehler beim Überprüfen des Auth-Status:", error);
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
        document.body.classList.add('locked');
    }

    // Event Listener für Elemente, die erst nach dem DOM-Laden sicher verfügbar sind
    // (Die meisten sind durch onclick im HTML, aber dies ist eine saubere Alternative)
    const autoIntervalInput = document.getElementById("autoInterval");
    if (autoIntervalInput) {
        autoIntervalInput.placeholder = "60"; // Standard als Platzhalter
        autoIntervalInput.disabled = true;
        autoIntervalInput.style.opacity = "0.5";
    }
});


// --- Login / Logout ---
window.submitAccessCode = async function() {
    const codeInput = document.getElementById("accessCode");
    const errorMsg = document.getElementById("loginError");
    const code = codeInput?.value.trim();

    if (!codeInput || !errorMsg) return;

    if (!code || code.length !== 8) {
        errorMsg.textContent = "❌ Bitte 8-stelligen Code eingeben.";
        errorMsg.style.display = "block";
        return;
    }
    errorMsg.style.display = "none"; // Fehler vor neuem Versuch ausblenden

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await response.json();

        if (data.success) {
            currentUserId = data.userId;
            currentUsername = data.username;
            sessionStorage.setItem("authenticated", "true"); // Für schnelle Client-Checks, aber Server ist maßgebend
            sessionStorage.setItem("userId", data.userId);
            sessionStorage.setItem("username", data.username);

            document.getElementById('usernameDisplay').textContent = `Angemeldet als: ${currentUsername}`;
            document.getElementById("loginOverlay").style.display = "none";
            document.getElementById("appContainer").style.display = "block";
            document.body.classList.remove("locked");
            loadSavedSearches(); // Gespeicherte Suchen nach Login laden
            initializeExcludeWords(); // Ausschlusswörter initialisieren
        } else {
            errorMsg.textContent = data.message || "❌ Zugang verweigert.";
            errorMsg.style.display = "block";
        }
    } catch (err) {
        console.error("Fehler beim Login-Request:", err);
        errorMsg.textContent = "❌ Fehler bei der Anmeldung. Server nicht erreichbar?";
        errorMsg.style.display = "block";
    }
};

window.logoutUser = async function() {
    try {
        await fetch('/logout');
        currentUserId = null;
        currentUsername = null;
        sessionStorage.removeItem("authenticated");
        sessionStorage.removeItem("userId");
        sessionStorage.removeItem("username");

        document.getElementById("loginOverlay").style.display = "flex";
        document.getElementById("appContainer").style.display = "none";
        document.body.classList.add("locked");
        document.getElementById('usernameDisplay').textContent = '';
        const savedSearchesList = document.getElementById('savedSearchesList');
        if (savedSearchesList) savedSearchesList.innerHTML = ''; // Gespeicherte Suchen leeren
        document.getElementById('savedSearchesSection').style.display = 'none';
    } catch (error) {
        console.error("Fehler beim Logout:", error);
        showUserMessage("Fehler beim Abmelden.", "error");
    }
};


// --- Ausschlusswörter ---
const defaultExcludeWords = [
    "gaming pc", "rechner", "laptop", "notebook", "setup", "system", "komplett",
    "bundle", "monitor", "mainboard", "computer", "tower", "suche", "tausche",
    "tauschen", "miete", "mieten", "verleihen", "defekt", "kaputt"
];
let userExcludeWords = new Set(); // Wird initialisiert

function initializeExcludeWords() {
    userExcludeWords = new Set(defaultExcludeWords); // Beginne mit den Standardwörtern
    // Hier könnte man später benutzerdefinierte, in der DB gespeicherte Wörter laden
    // Für jetzt verwenden wir localStorage, aber mit userId-Scope
    const userIdForStorage = sessionStorage.getItem('userId');
    if (userIdForStorage) {
        try {
            const saved = localStorage.getItem(`excludeFilters_${userIdForStorage}`);
            if (saved) {
                // Füge gespeicherte Wörter hinzu, Standardwörter bleiben aktiv, wenn nicht explizit entfernt
                const parsedSaved = JSON.parse(saved);
                if (Array.isArray(parsedSaved)) {
                    parsedSaved.forEach(word => userExcludeWords.add(word));
                }
            }
        } catch (e) {
            console.warn("Fehler beim Laden gespeicherter Ausschlusswörter:", e);
        }
    }
    renderExcludeWords();
}

function renderExcludeWords() {
    const container = document.getElementById("exclude-word-list");
    if (!container) return;
    container.innerHTML = "";

    // Alle Wörter im Set anzeigen (kombiniert Default und Custom)
    // Wir brauchen eine Möglichkeit zu unterscheiden, welche "aktiv" sind (d.h. für die aktuelle Suche verwendet werden)
    // Für dieses Beispiel: Alle Wörter im Set sind "aktiv". Klick deaktiviert/entfernt sie.
    // Um Verwirrung zu vermeiden: Zeige alle Wörter an, die im Set `userExcludeWords` sind.
    // Die Unterscheidung in "default" und "custom" ist für die Anzeige, welche man *permanent* entfernen kann.

    const allWordsToDisplay = Array.from(userExcludeWords).sort();

    allWordsToDisplay.forEach(word => {
        const span = document.createElement("span");
        span.textContent = word;
        span.classList.add("word-tag", "active"); // Alle im Set sind erstmal aktiv

        span.addEventListener("click", () => {
            if (userExcludeWords.has(word)) {
                userExcludeWords.delete(word); // Entfernt aus dem aktiven Set
            } // Ein erneuter Klick würde es nicht wieder hinzufügen, das macht addCustomExclude
            renderExcludeWords(); // Neu rendern
            saveExcludeWordsToLocalStorage();
        });
        container.appendChild(span);
    });
}

window.addCustomExclude = function() {
    const input = document.getElementById("customExclude");
    if (!input) return;
    const word = input.value.trim().toLowerCase();
    if (word) {
        userExcludeWords.add(word);
        renderExcludeWords();
        saveExcludeWordsToLocalStorage();
        input.value = ""; // Feld leeren
    }
}

function saveExcludeWordsToLocalStorage() {
    const userIdForStorage = sessionStorage.getItem('userId');
    if (userIdForStorage) {
        try {
            localStorage.setItem(`excludeFilters_${userIdForStorage}`, JSON.stringify([...userExcludeWords]));
        } catch (e) {
            console.warn("Fehler beim Speichern der Ausschlusswörter:", e);
        }
    }
}


// --- Gespeicherte Suchen ---
window.saveCurrentSearch = async function() {
    if (!currentUserId) {
        showUserMessage("Bitte zuerst einloggen, um Suchen zu speichern.", "error");
        return;
    }
    const searchNameInput = document.getElementById('searchNameToSave');
    const search_name = searchNameInput?.value.trim();
    if (!search_name) {
        showUserMessage("Bitte einen Namen für die Suche eingeben.", "error");
        searchNameInput?.focus();
        return;
    }

    const searchParams = {
        search_name,
        query: document.getElementById('query')?.value || "",
        pages: parseInt(document.getElementById('pages')?.value) || 10,
        plz: document.getElementById('plz')?.value || "",
        radius: document.getElementById('radius')?.value || "0",
        exclude_words: [...userExcludeWords].join(','),
        min_price: parseInt(document.getElementById('minPrice')?.value) || null,
        price_limit: parseInt(document.getElementById('priceLimit')?.value) || null,
        category_slug: selectedCategorySlug,
        category_id: selectedCategoryId
    };

    try {
        const response = await fetch('/api/saved-searches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchParams)
        });
        const data = await response.json();
        if (data.success) {
            showUserMessage(`Suche "${search_name}" erfolgreich gespeichert!`, 'success');
            searchNameInput.value = ''; // Feld leeren
            loadSavedSearches(); // Liste aktualisieren
        } else {
            showUserMessage(data.message || "Fehler beim Speichern der Suche.", "error");
        }
    } catch (error) {
        console.error("Fehler beim Speichern der Suche:", error);
        showUserMessage("Netzwerkfehler beim Speichern der Suche.", "error");
    }
};

async function loadSavedSearches() {
    if (!currentUserId) return;
    const listElement = document.getElementById('savedSearchesList');
    const sectionElement = document.getElementById('savedSearchesSection');
    const noSearchesMsg = document.getElementById('noSavedSearches');

    if (!listElement || !sectionElement || !noSearchesMsg) return;

    try {
        const response = await fetch('/api/saved-searches');
        const data = await response.json();
        listElement.innerHTML = ''; // Alte Einträge löschen

        if (data.success && data.searches.length > 0) {
            sectionElement.style.display = 'block';
            noSearchesMsg.style.display = 'none';
            data.searches.forEach(search => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span class="search-name">${search.search_name}</span>
                    <small>(Gespeichert: ${new Date(search.created_at).toLocaleDateString()})</small>
                    <div class="search-actions">
                        <button onclick="applySavedSearch(event, ${search.id})" title="Diese Suche laden"><i class="fas fa-upload"></i> Laden</button>
                        <button onclick="deleteSavedSearch(${search.id})" title="Diese Suche löschen"><i class="fas fa-trash"></i> Löschen</button>
                    </div>
                `;
                // Speichere die Suchdaten direkt am Button oder li-Element, um sie leicht zugänglich zu machen
                li.querySelector('button[onclick^="applySavedSearch"]').dataset.searchParams = JSON.stringify(search);
                listElement.appendChild(li);
            });
        } else if (data.success && data.searches.length === 0) {
            sectionElement.style.display = 'block'; // Sektion anzeigen, aber mit "keine Suchen" Text
            noSearchesMsg.style.display = 'block';
        } else {
            showUserMessage(data.message || "Gespeicherte Suchen konnten nicht geladen werden.", "error");
            sectionElement.style.display = 'none';
        }
    } catch (error) {
        console.error("Fehler beim Laden gespeicherter Suchen:", error);
        showUserMessage("Netzwerkfehler beim Laden gespeicherter Suchen.", "error");
        sectionElement.style.display = 'none';
    }
}

window.applySavedSearch = function(event, searchId) { // searchId ist hier optional, da Daten am Element hängen
    const searchDataString = event.currentTarget.dataset.searchParams;
    if (!searchDataString) {
        console.error("Keine Suchparameter am Element gefunden für ID:", searchId);
        showUserMessage("Fehler: Suchparameter nicht gefunden.", "error");
        return;
    }
    try {
        const search = JSON.parse(searchDataString);

        document.getElementById('query').value = search.query || "";
        document.getElementById('pages').value = search.pages || 10;
        document.getElementById('plz').value = search.plz || "";
        document.getElementById('radius').value = search.radius || "0";
        document.getElementById('minPrice').value = search.min_price || "";
        document.getElementById('priceLimit').value = search.price_limit || "";

        userExcludeWords = new Set(search.exclude_words ? search.exclude_words.split(',') : defaultExcludeWords);
        renderExcludeWords();

        if (search.category_id && search.category_slug && search.category_name) {
            selectedCategoryId = search.category_id;
            selectedCategorySlug = search.category_slug;
            selectedCategoryName = search.category_name; // Annahme: category_name wird mitgespeichert (DB-Anpassung nötig)
                                                        // Falls nicht: Finde das Element im Menü und simuliere Klick oder setze manuell
            document.getElementById('selectedCategoryNameText').textContent = selectedCategoryName || search.category_slug;
            document.getElementById('selectedCategoryContainer').style.display = 'flex';
        } else {
            clearSelectedCategory();
        }
        showUserMessage(`Suche "${search.search_name}" geladen.`, 'success');
        // Optional: Suche direkt ausführen
        // fetchOffers();
    } catch (e) {
        console.error("Fehler beim Parsen der Suchdaten:", e);
        showUserMessage("Fehler beim Laden der Suchdaten.", "error");
    }
};

window.deleteSavedSearch = async function(searchId) {
    if (!confirm("Sind Sie sicher, dass Sie diese gespeicherte Suche löschen möchten?")) {
        return;
    }
    try {
        const response = await fetch(`/api/saved-searches/${searchId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            showUserMessage("Suche erfolgreich gelöscht.", 'success');
            loadSavedSearches(); // Liste aktualisieren
        } else {
            showUserMessage(data.message || "Fehler beim Löschen der Suche.", "error");
        }
    } catch (error) {
        console.error("Fehler beim Löschen der Suche:", error);
        showUserMessage("Netzwerkfehler beim Löschen der Suche.", "error");
    }
};


// --- Scraping-Logik ---
window.fetchOffers = async function(auto = false) {
    if (!currentUserId) { // Zusätzliche Prüfung, obwohl UI dies verhindern sollte
        showUserMessage("Bitte zuerst einloggen.", "error");
        document.getElementById('loginOverlay').style.display = 'flex';
        return;
    }

    const query = document.getElementById('query')?.value || "";
    const plz = document.getElementById('plz')?.value || "";
    const radius = document.getElementById('radius')?.value || "0";
    const minPrice = document.getElementById('minPrice')?.value || "";
    const priceLimit = document.getElementById('priceLimit')?.value || "";
    const pages = document.getElementById('pages')?.value || 10; // Default 10
    // const email = document.getElementById('email')?.value || ""; // Email noch nicht serverseitig implementiert
    const excludeWordsParam = [...userExcludeWords].join(',');

    // Parameter für das Speichern von Ergebnissen
    const saveResultsCheckbox = document.getElementById('saveResultsCheckbox');
    const shouldSaveResults = saveResultsCheckbox ? saveResultsCheckbox.checked : false;
    const scrapeSessionNameInput = document.getElementById('scrapeSessionName');
    const scrapeSessName = scrapeSessionNameInput ? scrapeSessionNameInput.value.trim() : "";

    showLoader();
    if (!auto) disableAutoSearchControls(); // Bei manueller Suche Controls für Auto-Suche (de)aktivieren

    let fetchUrl = `/scrape?query=${encodeURIComponent(query)}&plz=${plz}&radius=${radius}&minPrice=${minPrice}&priceLimit=${priceLimit}&pages=${pages}&auto=${auto}&excludeWords=${encodeURIComponent(excludeWordsParam)}`;

    if (selectedCategorySlug && selectedCategoryId) {
        fetchUrl += `&categorySlug=${encodeURIComponent(selectedCategorySlug)}`;
        fetchUrl += `&categoryId=${encodeURIComponent(selectedCategoryId)}`;
    }
    if (shouldSaveResults) {
        fetchUrl += `&saveResults=true`;
        if (scrapeSessName) {
            fetchUrl += `&sessionName=${encodeURIComponent(scrapeSessName)}`;
        }
    }


    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            // Versuche, JSON-Fehler vom Server zu parsen
            if (response.status === 401) { // Spezifischer Fall für nicht authentifiziert
                showUserMessage("Sitzung abgelaufen oder nicht angemeldet. Bitte neu einloggen.", "error");
                logoutUser(); // Führe Logout-Routine aus, um UI zurückzusetzen
                hideLoader();
                enableAutoSearchControls();
                return;
            }
            const errorData = await response.json().catch(() => ({ message: `HTTP-Fehler! Status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP-Fehler! Status: ${response.status}`);
        }
        const data = await response.json();
        const container = document.getElementById("results");
        if (!container) return;
        container.innerHTML = "";
        hideLoader();
        if (!auto) enableAutoSearchControls();


        if (data.message && !Array.isArray(data)) { // Fehlerobjekt vom Server
            container.innerHTML = `<div class="result-card card-message"><div class="card-content"><p>${data.message}</p></div></div>`;
            return;
        }
        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = `<div class="result-card card-message"><div class="card-content"><p>Keine Angebote für Ihre Suche gefunden.</p></div></div>`;
            return;
        }

        // Die serverseitige Filterung durch `excludeWords` sollte ausreichen.
        // Clientseitige Filterung kann entfernt oder als zusätzliche Schicht beibehalten werden.
        // Für dieses Beispiel lassen wir sie weg, um Redundanz zu vermeiden, da der Server es bereits tut.

        data.forEach(offer => {
            const div = document.createElement("div");
            div.className = "result-card card";
            const formattedPrice = offer.price > 0
                ? `€${parseFloat(offer.price).toFixed(2)} (${offer.priceType || 'Festpreis'})`
                : (offer.priceType === "VB" ? "Preis VB" : "Kein Preis");

            div.innerHTML = `
                ${offer.image ? `<img src="${offer.image}" alt="${offer.title || 'Angebot'}" class="card-image">` : '<div class="card-image-placeholder">Kein Bild</div>'}
                <div class="card-content">
                    <h2>${offer.title || 'Unbekannter Titel'}</h2>
                    <p><strong>Preis:</strong> ${formattedPrice}</p>
                    <p><strong>Standort:</strong> ${offer.location || 'Unbekannt'}</p>
                    <p><strong>Score:</strong> ${offer.score !== undefined ? offer.score : 'N/A'}</p>
                    <a href="${offer.url || '#'}" target="_blank" rel="noopener noreferrer" class="card-link">Zum Angebot <i class="fas fa-external-link-alt"></i></a>
                </div>`;
            container.appendChild(div);
        });
        if (shouldSaveResults) {
             showUserMessage("Suchergebnisse wurden zur Speicherung an den Server gesendet.", "success");
             if(scrapeSessionNameInput) scrapeSessionNameInput.value = ""; // Optional Feld leeren
             if(saveResultsCheckbox) saveResultsCheckbox.checked = false; // Checkbox zurücksetzen
        }


        const autoCheckbox = document.getElementById("autoSearchToggle");
        if (autoCheckbox && autoCheckbox.checked && !auto) { // Nur neu starten, wenn es eine manuelle Suche mit aktivierter Auto-Option war
            let seconds = parseInt(document.getElementById("autoInterval")?.value || "60");
            if (isNaN(seconds) || seconds < 5) seconds = 60;

            clearInterval(autoSearchIntervalId);
            autoSearchIntervalId = setInterval(() => {
                console.log("Automatische Suche wird ausgeführt...");
                fetchOffers(true); // auto=true übergeben
            }, seconds * 1000);
            console.log(`🚀 Client-Auto-Suche aktiviert (alle ${seconds} Sekunden)`);
        } else if (!autoCheckbox || !autoCheckbox.checked) {
            clearInterval(autoSearchIntervalId);
        }

    } catch (err) {
        console.error("❌ Fehler bei der Suche:", err);
        hideLoader();
        if (!auto) enableAutoSearchControls();
        const container = document.getElementById("results");
        if (container) container.innerHTML = `<p class="error-message">Fehler: ${err.message}. Bitte versuchen Sie es später erneut.</p>`;
    }
};


window.cancelSearch = async function() {
    // Wichtig: Der Server bricht nur die Playwright-Suche ab.
    // Der Client muss ggf. eigene Intervalle etc. stoppen.
    clearInterval(autoSearchIntervalId); // Client-seitige Auto-Suche stoppen
    document.getElementById('autoSearchToggle').checked = false; // Checkbox zurücksetzen
    enableAutoSearchControls(); // Controls reaktivieren

    showLoader();
    try {
        const response = await fetch('/cancel', { method: 'POST' });
        const data = await response.json();
        console.log(data.message);
        hideLoader();
        showUserMessage("Suche wurde serverseitig abgebrochen.", "success");
    } catch (err) {
        console.error("Fehler beim Abbrechen:", err);
        hideLoader();
        showUserMessage("Keine aktive Suche zum Abbrechen gefunden oder Fehler.", "error");
    }
};


// --- UI Hilfsfunktionen ---
function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';
}
function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
}

function disableAutoSearchControls() {
    const checkbox = document.getElementById("autoSearchToggle");
    const input = document.getElementById("autoInterval");
    if (checkbox) checkbox.disabled = true;
    if (input) {
        input.disabled = true;
        input.style.opacity = "0.5";
    }
}
function enableAutoSearchControls() {
    const checkbox = document.getElementById("autoSearchToggle");
    const input = document.getElementById("autoInterval");
    if (checkbox) checkbox.disabled = false;
    if (input) {
        input.disabled = !(checkbox && checkbox.checked); // Nur aktivieren, wenn Checkbox an ist
        input.style.opacity = (checkbox && checkbox.checked) ? "1" : "0.5";
    }
}

window.quickSearch = function(keyword) {
    const queryInput = document.getElementById('query');
    if (queryInput) queryInput.value = keyword;
    fetchOffers(); // Ruft fetchOffers ohne 'auto=true' auf
};

window.toggleAutoSearch = function(checkbox) {
    const intervalInput = document.getElementById('autoInterval');
    if (!intervalInput) return;
    if (checkbox.checked) {
        intervalInput.disabled = false;
        intervalInput.style.opacity = "1";
        // Startet die Auto-Suche nicht sofort, erst nach einer manuellen Suche mit aktivierter Checkbox
    } else {
        intervalInput.disabled = true;
        intervalInput.style.opacity = "0.5";
        clearInterval(autoSearchIntervalId);
        console.log("⛔ Client-Auto-Suche gestoppt.");
    }
};

window.toggleFilters = function() {
    const filters = document.getElementById('advanced-filters');
    const button = document.querySelector('.toggle-filters-button');
    if (!filters || !button) return;
    filters.classList.toggle('hidden');
    button.classList.toggle('open');
};

// --- Kategorie-Menü Funktionen ---
window.toggleCategoryMenu = function() {
    const menu = document.getElementById('categoryMenu');
    const body = document.body;
    if (!menu) return;
    menu.classList.toggle('show');
    body.classList.toggle('category-menu-open');
};

window.toggleSubmenu = function(element) {
    const submenu = element.nextElementSibling;
    const iconElement = element.querySelector('i.fas.fa-chevron-down');
    if (!submenu) return;

    const currentlyOpen = submenu.classList.contains('open');
    // Alle anderen Submenüs im selben Hauptmenü schließen
    const parentUl = element.closest('aside#categoryMenu > ul'); // Das äußerste UL im Aside
    if (parentUl) {
        parentUl.querySelectorAll('.submenu.open').forEach(openSub => {
            openSub.classList.remove('open');
            const prevTitle = openSub.previousElementSibling;
            if (prevTitle && prevTitle.classList.contains('category-title')) {
                prevTitle.classList.remove('open');
            }
        });
    }
    // Aktuelles Submenü öffnen/schließen
    if (!currentlyOpen) {
        submenu.classList.add('open');
        if (iconElement) element.classList.add('open');
    } // Bereits offene bleiben nach dem Schließen aller anderen nicht wieder offen
};

window.selectCategory = function(element) {
    selectedCategoryName = element.dataset.categoryName;
    selectedCategorySlug = element.dataset.categorySlug;
    selectedCategoryId = element.dataset.categoryId;

    const nameTextElem = document.getElementById('selectedCategoryNameText');
    const containerElem = document.getElementById('selectedCategoryContainer');

    if (nameTextElem) nameTextElem.textContent = selectedCategoryName;
    if (containerElem) containerElem.style.display = 'flex';

    toggleCategoryMenu(); // Menü nach Auswahl schließen
    // Optional: fetchOffers(); // Suche direkt mit neuer Kategorie starten
};

window.clearSelectedCategory = function() {
    selectedCategoryName = null;
    selectedCategorySlug = null;
    selectedCategoryId = null;

    const containerElem = document.getElementById('selectedCategoryContainer');
    const nameTextElem = document.getElementById('selectedCategoryNameText');

    if (containerElem) containerElem.style.display = 'none';
    if (nameTextElem) nameTextElem.textContent = '';
};