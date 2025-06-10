// script.js - Vollständige und bereinigte Version

// Globale Variablen für die ausgewählte Kategorie
let selectedCategoryName = null;
let selectedCategorySlug = null;
let selectedCategoryId = null;

// Globale Variablen für Benutzerdaten (nach Login gefüllt)
let currentUserId = null;
let currentUsername = null;

let autoSearchIntervalId; // Für die clientseitige Auto-Suche der Hauptseite
let notificationPollingIntervalId; // Für das Abrufen von Postfach-Nachrichten

// Hilfsfunktion für User-Nachrichten
function showUserMessage(message, type = 'success', duration = 4000) {
    const msgContainer = document.getElementById('userMessages');
    if (!msgContainer) return;
    msgContainer.textContent = message;
    msgContainer.className = `user-messages ${type}`;
    msgContainer.style.display = 'block';
    setTimeout(() => {
        if (msgContainer) {
            msgContainer.style.display = 'none';
            msgContainer.textContent = '';
        }
    }, duration);
}

// --- Initialisierung und Auth ---
window.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatusAndInitializeApp();

    const autoIntervalInput = document.getElementById("autoInterval");
    if (autoIntervalInput) {
        autoIntervalInput.placeholder = "60";
        autoIntervalInput.disabled = true;
        autoIntervalInput.style.opacity = "0.5";
    }

    const dashboardLink = document.getElementById('openDashboardLink');
    if (dashboardLink) {
        dashboardLink.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToView('dashboardView');
        });
    }
    document.addEventListener('click', handleClickOutside);
});

async function checkAuthStatusAndInitializeApp() {
    try {
        const response = await fetch('/api/auth-status');
        if (!response.ok) {
             console.error(`Auth status check HTTP error: ${response.status}`);
             showLoginView();
             return;
        }
        const data = await response.json();

        if (data.success && data.isAuthenticated) {
            currentUserId = data.userId;
            currentUsername = data.username;
            sessionStorage.setItem("userId", data.userId);
            sessionStorage.setItem("username", data.username);
            sessionStorage.setItem("authenticated", "true");

            const usernameDisplay = document.getElementById('usernameDisplay');
            if (usernameDisplay) usernameDisplay.textContent = `${currentUsername}`;
            
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
            
            const appContainer = document.getElementById('appContainer');
            if (appContainer) appContainer.style.display = 'block';
            
            document.body.classList.remove('locked');
            
            navigateToView('mainSearchView');
            loadSavedSearches();
            initializeExcludeWords();
            fetchNotificationsAndUpdateBadge();
            
            if (notificationPollingIntervalId) clearInterval(notificationPollingIntervalId);
            notificationPollingIntervalId = setInterval(fetchNotificationsAndUpdateBadge, 60000);
        } else {
            showLoginView();
        }
    } catch (error) {
        console.error("Fehler beim Überprüfen des Auth-Status:", error);
        showLoginView();
    }
}

function showLoginView() {
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.style.display = 'flex';
    
    const appContainer = document.getElementById('appContainer');
    if (appContainer) appContainer.style.display = 'none';
    
    document.body.classList.add('locked');
    currentUserId = null;
    currentUsername = null;
    sessionStorage.clear();
    if (notificationPollingIntervalId) clearInterval(notificationPollingIntervalId);
    if (autoSearchIntervalId) clearInterval(autoSearchIntervalId);
}

// --- Login / Logout ---
// --- Login / Logout ---

// GEÄNDERT: Diese Funktion initialisiert die App jetzt direkt nach dem erfolgreichen Login.
window.submitAccessCode = async function() {
    const codeInput = document.getElementById("accessCode");
    const errorMsg = document.getElementById("loginError");
    if (!codeInput || !errorMsg) { console.error("Login form elements not found for submitAccessCode"); return; }
    const code = codeInput.value.trim();

    if (!code || code.length !== 8) {
        errorMsg.textContent = "❌ Bitte 8-stelligen Code eingeben.";
        errorMsg.style.display = "block";
        return;
    }
    errorMsg.style.display = "none";

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await response.json();

        if (data.success) {
            // ---- HIER IST DIE KORREKTUR ----
            // Statt checkAuthStatusAndInitializeApp() aufzurufen,
            // handeln wir direkt auf Basis der erfolgreichen Login-Antwort.

            // 1. Globale Variablen und Session Storage mit den Daten vom Login füllen
            currentUserId = data.userId;
            currentUsername = data.username;
            sessionStorage.setItem("userId", data.userId);
            sessionStorage.setItem("username", data.username);
            sessionStorage.setItem("authenticated", "true");

            // 2. Die Benutzeroberfläche aktualisieren
            const usernameDisplay = document.getElementById('usernameDisplay');
            if (usernameDisplay) usernameDisplay.textContent = `${currentUsername}`;
            
            const loginOverlay = document.getElementById('loginOverlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
            
            const appContainer = document.getElementById('appContainer');
            if (appContainer) appContainer.style.display = 'block';
            
            document.body.classList.remove('locked');

            // 3. Die App vollständig initialisieren (wie es checkAuthStatusAndInitializeApp tun würde)
            navigateToView('mainSearchView');
            loadSavedSearches();
            initializeExcludeWords();
            fetchNotificationsAndUpdateBadge();
            
            if (notificationPollingIntervalId) clearInterval(notificationPollingIntervalId);
            notificationPollingIntervalId = setInterval(fetchNotificationsAndUpdateBadge, 60000);
            
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
        showLoginView(); 
        const usernameDisplay = document.getElementById('usernameDisplay');
        if (usernameDisplay) usernameDisplay.textContent = '';
        const savedSearchesList = document.getElementById('savedSearchesList');
        if (savedSearchesList) savedSearchesList.innerHTML = '';
        const savedSearchesSection = document.getElementById('savedSearchesSection');
        if (savedSearchesSection) savedSearchesSection.style.display = 'none';
    } catch (error) {
        console.error("Fehler beim Logout:", error);
        showUserMessage("Fehler beim Abmelden.", "error");
    }
};

// --- Profil Dropdown ---
window.toggleProfileDropdown = function() {
    const dropdown = document.getElementById('profileDropdownMenu');
    const profileButton = document.getElementById('userProfileButton');
    const arrow = profileButton?.querySelector('.profile-arrow');
    if (!dropdown || !profileButton) return;

    const isShown = dropdown.classList.toggle('show');
    if (arrow) arrow.classList.toggle('open', isShown);
};

function handleClickOutside(event) {
    const profileButton = document.getElementById('userProfileButton');
    const dropdown = document.getElementById('profileDropdownMenu');
    const categoryMenuButton = document.querySelector('.menu-button');
    const categoryMenu = document.getElementById('categoryMenu');

    if (dropdown && profileButton && !profileButton.contains(event.target) && !dropdown.contains(event.target)) {
        if (dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
            profileButton.querySelector('.profile-arrow')?.classList.remove('open');
        }
    }
    if (categoryMenu && categoryMenuButton && !categoryMenuButton.contains(event.target) && !categoryMenu.contains(event.target)) {
         if (categoryMenu.classList.contains('show')) {
            categoryMenu.classList.remove('show');
            document.body.classList.remove('category-menu-open');
        }
    }
}

// --- Navigation / Ansichten-Management ---
function navigateToView(viewId) {
    const views = ['mainSearchView', 'dashboardView', 'inboxView'];
    views.forEach(id => {
        const view = document.getElementById(id);
        if (view) view.style.display = (id === viewId) ? 'block' : 'none';
    });

    if (viewId === 'dashboardView' && currentUserId) { 
        loadMonitoredSearches();
        populateMonitorCategorySelect(); // <-- DIESE ZEILE HINZUFÜGEN
    } else if (viewId === 'inboxView' && currentUserId) {
        fetchNotificationsAndUpdateBadge(true);
    }

    document.getElementById('profileDropdownMenu')?.classList.remove('show');
    document.querySelector('#userProfileButton .profile-arrow')?.classList.remove('open');
    document.getElementById('categoryMenu')?.classList.remove('show');
    document.body.classList.remove('category-menu-open');
}


// --- Ausschlusswörter ---
const defaultExcludeWords = [
    "gaming pc", "rechner", "laptop", "notebook", "setup", "system", "komplett",
    "bundle", "monitor", "mainboard", "computer", "tower", "suche", "tausche",
    "tauschen", "miete", "mieten", "verleihen", "defekt", "kaputt"
];
let userExcludeWords = new Set();

function initializeExcludeWords() {
    userExcludeWords = new Set(defaultExcludeWords);
    const userIdForStorage = sessionStorage.getItem('userId');
    if (userIdForStorage) {
        try {
            const saved = localStorage.getItem(`excludeFilters_${userIdForStorage}`);
            if (saved) {
                const parsedSaved = JSON.parse(saved);
                if (Array.isArray(parsedSaved)) {
                    parsedSaved.forEach(word => userExcludeWords.add(word));
                }
            }
        } catch (e) { console.warn("Fehler Laden Ausschlusswörter:", e); }
    }
    renderExcludeWords();
}

function renderExcludeWords() {
    const container = document.getElementById("exclude-word-list");
    if (!container) return;
    container.innerHTML = "";
    const allWordsToDisplay = Array.from(userExcludeWords).sort();
    allWordsToDisplay.forEach(word => {
        const span = document.createElement("span");
        span.textContent = word;
        span.classList.add("word-tag", "active");
        span.addEventListener("click", () => {
            userExcludeWords.delete(word);
            renderExcludeWords();
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
        input.value = "";
    }
};
function saveExcludeWordsToLocalStorage() {
    const userIdForStorage = sessionStorage.getItem('userId');
    if (userIdForStorage) {
        try {
            localStorage.setItem(`excludeFilters_${userIdForStorage}`, JSON.stringify([...userExcludeWords]));
        } catch (e) { console.warn("Fehler Speichern Ausschlusswörter:", e); }
    }
}

// --- Gespeicherte Suchen (Manuell) ---

// GEÄNDERT: Diese Funktion speichert jetzt auch die Auto-Filter mit ab.
window.saveCurrentSearch = async function() {
    if (!currentUserId) { showUserMessage("Bitte zuerst einloggen.", "error"); return; }
    const searchNameInput = document.getElementById('searchNameToSave');
    const search_name = searchNameInput?.value.trim();
    if (!search_name) { showUserMessage("Bitte Namen für Suche eingeben.", "error"); searchNameInput?.focus(); return; }
    
    // Basis-Suchparameter sammeln
    const searchParams = {
        search_name,
        query: document.getElementById('query')?.value || "",
        pages: parseInt(document.getElementById('pages')?.value) || 10,
        plz: document.getElementById('plz')?.value || "",
        radius: document.getElementById('radius')?.value || "0",
        exclude_words: [...userExcludeWords].join(','),
        min_price: document.getElementById('minPrice')?.value ? parseInt(document.getElementById('minPrice').value) : null,
        price_limit: document.getElementById('priceLimit')?.value ? parseInt(document.getElementById('priceLimit').value) : null,
        category_slug: selectedCategorySlug,
        category_id: selectedCategoryId,
        category_name: selectedCategoryName
    };

    // HINZUGEFÜGT: Wenn die Kategorie "autos" ist, füge die spezifischen Filter hinzu.
    if (selectedCategorySlug === 'autos') {
        searchParams.km_min = document.getElementById('kmMin')?.value || null;
        searchParams.km_max = document.getElementById('kmMax')?.value || null;
        searchParams.ez_min = document.getElementById('ezMin')?.value || null;
        searchParams.ez_max = document.getElementById('ezMax')?.value || null;
        searchParams.power_min = document.getElementById('powerMin')?.value || null;
        searchParams.power_max = document.getElementById('powerMax')?.value || null;
        searchParams.tuev_min = document.getElementById('tuevMin')?.value || null;
    }

    try {
        const response = await fetch('/api/saved-searches', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(searchParams) });
        const data = await response.json();
        if(data.success){ showUserMessage(`Suche "${search_name}" gespeichert!`, 'success'); if(searchNameInput) searchNameInput.value=''; loadSavedSearches(); }
        else { showUserMessage(data.message || "Fehler Speichern.", "error");}
    } catch (err) { console.error("Fehler saveCurrentSearch:", err); showUserMessage("Netzwerkfehler Speichern.", "error");}
};

// ... die Funktion loadSavedSearches bleibt unverändert ...
async function loadSavedSearches() {
    if (!currentUserId) return;
    const listElement = document.getElementById('savedSearchesList');
    const sectionElement = document.getElementById('savedSearchesSection');
    const noSearchesMsg = document.getElementById('noSavedSearches');
    if (!listElement || !sectionElement || !noSearchesMsg) return;

    try {
        console.log("Lade gespeicherte Suchen vom Server..."); // Test-Log
        const response = await fetch('/api/saved-searches');
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const data = await response.json();
        listElement.innerHTML = ''; 

        if (data.success && data.searches.length > 0) {
            sectionElement.style.display = 'block';
            noSearchesMsg.style.display = 'none';
            data.searches.forEach(search => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span class="search-name">${search.search_name}</span>
                    <small>(Gespeichert: ${new Date(search.created_at).toLocaleDateString('de-DE')})</small>
                    <div class="search-actions">
                        <button class="load-search-btn" title="Diese Suche laden"><i class="fas fa-upload"></i> Laden</button>
                        <button class="delete-search-btn" title="Diese Suche löschen"><i class="fas fa-trash"></i> Löschen</button>
                    </div>`;
                li.querySelector('.load-search-btn').addEventListener('click', (event) => applySavedSearch(event, search));
                li.querySelector('.delete-search-btn').addEventListener('click', () => deleteSavedSearch(search.id));
                listElement.appendChild(li);
            });
        } else if (data.success && data.searches.length === 0) {
            sectionElement.style.display = 'block';
            noSearchesMsg.style.display = 'block';
        } else {
            showUserMessage(data.message || "Gespeicherte Suchen konnten nicht geladen werden.", "error");
            sectionElement.style.display = 'none';
        }
    } catch (err) {
        console.error("Fehler in loadSavedSearches:", err);
        showUserMessage("Netzwerkfehler beim Laden der Suchen.", "error");
        if (sectionElement) sectionElement.style.display = 'none';
    }
}

// GEÄNDERT: Diese Funktion füllt jetzt auch die Auto-Filter-Felder, wenn sie eine gespeicherte Suche lädt.
window.applySavedSearch = function(event, searchData) {
    try {
        // Standardfelder füllen
        document.getElementById('query').value = searchData.query || "";
        document.getElementById('pages').value = searchData.pages || 10;
        document.getElementById('plz').value = searchData.plz || "";
        document.getElementById('radius').value = searchData.radius || "0";
        document.getElementById('minPrice').value = searchData.min_price || "";
        document.getElementById('priceLimit').value = searchData.price_limit || "";

        // Ausschlusswörter setzen
        userExcludeWords = new Set(searchData.exclude_words ? searchData.exclude_words.split(',') : defaultExcludeWords);
        renderExcludeWords();

        // Kategorieauswahl anwenden
        if (searchData.category_id && searchData.category_slug) {
            // Die selectCategory Funktion aufrufen, damit die UI (inkl. Auto-Filter Anzeige) korrekt aktualisiert wird
            const categoryListItem = document.querySelector(`li[data-category-id="${searchData.category_id}"]`);
            if (categoryListItem) {
                selectCategory(categoryListItem);
            }
        } else { 
            clearSelectedCategory(); 
        }

        // HINZUGEFÜGT: Spezifische Auto-Filter füllen, falls vorhanden
        if (searchData.category_slug === 'autos') {
            document.getElementById('kmMin').value = searchData.km_min || "";
            document.getElementById('kmMax').value = searchData.km_max || "";
            document.getElementById('ezMin').value = searchData.ez_min || "";
            document.getElementById('ezMax').value = searchData.ez_max || "";
            document.getElementById('powerMin').value = searchData.power_min || "";
            document.getElementById('powerMax').value = searchData.power_max || "";
            document.getElementById('tuevMin').value = searchData.tuev_min || "";
        }

        showUserMessage(`Suche "${searchData.search_name}" geladen.`, 'success');
        navigateToView('mainSearchView');
    } catch (e) { console.error("Fehler applySavedSearch:", e); showUserMessage("Fehler Laden Suchdaten.", "error"); }
};

window.deleteSavedSearch = async function(searchId) {
    if (!confirm("Gespeicherte Suche löschen?")) return;
    try {
        const response = await fetch(`/api/saved-searches/${searchId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) { showUserMessage("Suche gelöscht.", 'success'); loadSavedSearches(); }
        else { showUserMessage(data.message || "Fehler Löschen.", "error");}
    } catch (err) { console.error("Fehler deleteSavedSearch:", err); showUserMessage("Netzwerkfehler Löschen.", "error");}
};

// --- Dashboard: Überwachte Suchen ---
window.addMonitoredSearch = async function() {
    if (!currentUserId) { showUserMessage("Bitte einloggen.", "error"); return; }
    
    const searchNameInput = document.getElementById('monitorSearchName');
    const queryInput = document.getElementById('monitorQuery');
    
    const search_name = searchNameInput?.value.trim();
    const query = queryInput?.value.trim();

    if (!search_name || !query) {
        showUserMessage("Name und Suchbegriff für Überwachung sind Pflicht.", "error");
        return;
    }

    // Alle Parameter aus dem neuen, erweiterten Formular sammeln
    const query_params = {
        query: query,
        pages: 2, // Für überwachte Suchen reichen meist die ersten 2 Seiten
        plz: document.getElementById('monitorPlz')?.value.trim() || null,
        radius: document.getElementById('monitorRadius')?.value || "0",
        minPrice: document.getElementById('monitorMinPrice')?.value || null,
        priceLimit: document.getElementById('monitorPriceLimit')?.value || null,
        excludeWords: [...userExcludeWords].join(','), // Exclude-Wörter bleiben global
    };

    // Kategorie-Daten verarbeiten
    const categorySelect = document.getElementById('monitorCategory');
    const categoryValue = categorySelect.value;
    if (categoryValue) {
        const [slug, id, name] = categoryValue.split('|');
        query_params.categorySlug = slug;
        query_params.categoryId = id;
        query_params.categoryName = name; // Nützlich für die Anzeige
    }

    // Auto-spezifische Daten verarbeiten, wenn Kategorie "autos" ist
    if (query_params.categorySlug === 'autos') {
        query_params.kmMin = document.getElementById('monitorKmMin')?.value || null;
        query_params.kmMax = document.getElementById('monitorKmMax')?.value || null;
        query_params.ezMin = document.getElementById('monitorEzMin')?.value || null;
        query_params.ezMax = document.getElementById('monitorEzMax')?.value || null;
        query_params.powerMin = document.getElementById('monitorPowerMin')?.value || null;
        query_params.powerMax = document.getElementById('monitorPowerMax')?.value || null;
        query_params.tuevMin = document.getElementById('monitorTuevMin')?.value || null;
    }
    
    try {
        const response = await fetch('/api/monitored-searches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ search_name, query_params })
        });
        const data = await response.json();
        if (data.success) {
            showUserMessage(`Überwachung "${search_name}" hinzugefügt.`, "success");
            // Optional: Formularfelder zurücksetzen
            document.getElementById('addMonitoredSearchSection').querySelectorAll('input, select').forEach(el => {
                if(el.type === 'text' || el.type === 'number') el.value = '';
                if(el.tagName === 'SELECT') el.selectedIndex = 0;
            });
            toggleMonitorCarFilters(categorySelect); // Auto-Filter wieder verstecken
            loadMonitoredSearches();
        } else {
            showUserMessage(data.message || "Fehler beim Hinzufügen der Überwachung.", "error");
        }
    } catch (err) {
        console.error("Fehler addMonitoredSearch:", err);
        showUserMessage("Netzwerkfehler beim Hinzufügen der Überwachung.", "error");
    }
};

async function loadMonitoredSearches() {
    if (!currentUserId) return;
    const listEl = document.getElementById('monitoredSearchesList');
    const noMonitorsMsg = document.getElementById('noMonitoredSearches');
    if (!listEl || !noMonitorsMsg) return;

    try {
        const response = await fetch('/api/monitored-searches');
        if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        listEl.innerHTML = '';
        if (data.success && data.searches.length > 0) {
            noMonitorsMsg.style.display = 'none';
            data.searches.forEach(search => {
                const li = document.createElement('li');
                li.className = `monitored-search-item ${search.is_active ? 'active' : 'inactive'}`;
                let paramsPreview = 'Parameter nicht verfügbar';
                if (search.query_params && typeof search.query_params === 'object') {
                     paramsPreview = `"${search.query_params.query || 'N/A'}"`;
                     if(search.query_params.plz) paramsPreview += ` | PLZ: ${search.query_params.plz}`;
                     if(search.query_params.radius && search.query_params.radius !== "0") paramsPreview += ` | Umkreis: ${search.query_params.radius}km`;
                }

                li.innerHTML = `
                    <div class="monitor-info">
                        <span class="search-name">${search.search_name}</span>
                        <small class="status">Status: ${search.is_active ? 'Aktiv' : 'Pausiert'}</small>
                        <small class="params-preview">(${paramsPreview})</small>
                        <small class="last-checked">Zuletzt geprüft: ${search.last_checked_at ? new Date(search.last_checked_at).toLocaleString('de-DE') : 'Noch nie'}</small>
                        <small class="last-found">Zuletzt gefunden: ${search.last_found_count !== undefined ? search.last_found_count : 'N/A'} Angebote</small>
                    </div>
                    <div class="search-actions">
                        <button class="toggle-active-btn" onclick="toggleMonitoredSearchActive(${search.id})">
                            ${search.is_active ? '<i class="fas fa-pause"></i> Pausieren' : '<i class="fas fa-play"></i> Aktivieren'}
                        </button>
                        <button class="delete-monitor-btn" onclick="deleteMonitoredSearch(${search.id})">
                            <i class="fas fa-trash"></i> Löschen
                        </button>
                    </div>`;
                listEl.appendChild(li);
            });
        } else {
            noMonitorsMsg.style.display = 'block';
            noMonitorsMsg.textContent = 'Keine aktiven Überwachungen.';
             if (!data.success && data.message) showUserMessage(data.message, "error");
        }
    } catch (err) {
        console.error("Fehler loadMonitoredSearches:", err);
        if(noMonitorsMsg) {
            noMonitorsMsg.textContent = 'Fehler beim Laden der Überwachungen.';
            noMonitorsMsg.style.display = 'block';
        }
    }
}

window.toggleMonitoredSearchActive = async function(searchId) {
    try {
        const response = await fetch(`/api/monitored-searches/${searchId}/toggle`, { method: 'PUT' });
        const data = await response.json();
        if (data.success) {
            showUserMessage(data.message, "success");
            loadMonitoredSearches();
        } else {
            showUserMessage(data.message || "Fehler beim Umschalten.", "error");
        }
    } catch (err) { showUserMessage("Netzwerkfehler.", "error"); }
};

window.deleteMonitoredSearch = async function(searchId) {
    if (!confirm("Diese automatische Überwachung wirklich löschen?")) return;
    try {
        const response = await fetch(`/api/monitored-searches/${searchId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            showUserMessage("Überwachung gelöscht.", "success");
            loadMonitoredSearches();
        } else {
            showUserMessage(data.message || "Fehler beim Löschen.", "error");
        }
    } catch (err) { showUserMessage("Netzwerkfehler.", "error"); }
};

// --- Postfach / Notifications ---
window.openInbox = function() {
    navigateToView('inboxView');
};

async function fetchNotificationsAndUpdateBadge(markAsOpeningInbox = false) {
    if (!currentUserId) return;
    const inboxMessagesDiv = document.getElementById('inboxMessages');
    const noMessagesMsg = document.getElementById('noInboxMessages');
    const badge = document.getElementById('inboxNotificationBadge');
    if (!badge) { console.error("Notification badge not found"); return; }

    try {
        const response = await fetch('/api/notifications');
        if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.success) {
            if (data.unreadCount > 0) {
                badge.textContent = data.unreadCount > 99 ? '99+' : data.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }

            if (document.getElementById('inboxView')?.style.display === 'block') {
                if (!inboxMessagesDiv || !noMessagesMsg) return;
                inboxMessagesDiv.innerHTML = '';
                if (data.notifications.length > 0) {
                    noMessagesMsg.style.display = 'none';
                    data.notifications.forEach(notif => {
                        const div = document.createElement('div');
                        div.className = `notification-item ${notif.is_read ? 'read' : 'unread'}`;
                        div.innerHTML = `
                            <a href="${notif.offer_url}" target="_blank" rel="noopener noreferrer" class="notification-link" data-notification-id="${notif.id}">
                                <strong>${notif.offer_title || 'Neues Angebot'}</strong>
                                <span class="offer-price">(${notif.offer_price || 'N/A'})</span>
                            </a>
                            <div class="notification-meta">
                                <small>${new Date(notif.created_at).toLocaleString('de-DE')}</small>
                                ${!notif.is_read ? `<button class="mark-read-btn-single" title="Als gelesen markieren" onclick="markOneNotificationAsRead(${notif.id}, event)"><i class="fas fa-check"></i></button>` : ''}
                            </div>`;
                        div.querySelector('.notification-link').addEventListener('click', function() {
                           markOneNotificationAsRead(this.dataset.notificationId);
                        });
                        inboxMessagesDiv.appendChild(div);
                    });
                } else {
                    noMessagesMsg.style.display = 'block';
                    noMessagesMsg.textContent = 'Keine neuen Nachrichten.';
                }
            }
        } else {
            if (document.getElementById('inboxView')?.style.display === 'block' && noMessagesMsg) {
                 noMessagesMsg.textContent = data.message || 'Fehler beim Laden der Nachrichten.';
                 noMessagesMsg.style.display = 'block';
            }
             if(badge) badge.style.display = 'none';
        }
    } catch (err) {
        console.error("Fehler fetchNotificationsAndUpdateBadge:", err);
        if (document.getElementById('inboxView')?.style.display === 'block' && noMessagesMsg) {
            noMessagesMsg.textContent = 'Netzwerkfehler beim Laden der Nachrichten.';
            noMessagesMsg.style.display = 'block';
        }
        if(badge) badge.style.display = 'none';
    }
}

window.markOneNotificationAsRead = async function(notificationId, event) {
    if (event) event.stopPropagation();
    try {
        const response = await fetch(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
        if (!response.ok) throw new Error("Fehler beim Serveraufruf");
        
        const item = document.querySelector(`.notification-link[data-notification-id="${notificationId}"]`)?.closest('.notification-item');
        if(item && !item.classList.contains('read')) {
            item.classList.add('read');
            item.querySelector('.mark-read-btn-single')?.remove();
            
            const badge = document.getElementById('inboxNotificationBadge');
            if (badge && badge.style.display !== 'none') {
                let currentCountText = badge.textContent;
                let currentCount = (currentCountText === '99+') ? 100 : parseInt(currentCountText); // Annahme für 99+

                if (!isNaN(currentCount) && currentCount > 0) {
                    currentCount--;
                    badge.textContent = currentCount > 99 ? '99+' : (currentCount > 0 ? currentCount.toString() : '0');
                    if (currentCount === 0) badge.style.display = 'none';
                } else {
                     // Wenn Badge schon '0' oder leer war, oder 99+ und wir nicht sicher sind
                     fetchNotificationsAndUpdateBadge(); // Sicherste Methode: neu vom Server holen
                }
            }
        }
    } catch (err) { console.error("Fehler markOneNotificationAsRead:", err); }
};

window.markAllNotificationsAsRead = async function() {
    try {
        const response = await fetch('/api/notifications/read-all', {method: 'PUT'});
        const data = await response.json();
        if (data.success) {
            showUserMessage("Alle Nachrichten als gelesen markiert.", "success");
            fetchNotificationsAndUpdateBadge(true);
        } else { showUserMessage(data.message || "Fehler.", "error"); }
    } catch (err) { showUserMessage("Netzwerkfehler.", "error"); }
};

// --- Haupt-Scraping-Funktion (fetchOffers) ---
window.fetchOffers = async function(auto = false) {
    const query = document.getElementById('query')?.value || "";
    const plz = document.getElementById('plz')?.value || "";
    const radius = document.getElementById('radius')?.value || "0";
    const minPrice = document.getElementById('minPrice')?.value || "";
    const priceLimit = document.getElementById('priceLimit')?.value || "";
    const pages = document.getElementById('pages')?.value || 10;
    const excludeWordsParam = [...userExcludeWords].join(',');
    const saveResultsCheckbox = document.getElementById('saveResultsCheckbox');
    const shouldSaveResults = saveResultsCheckbox ? saveResultsCheckbox.checked : false;
    const scrapeSessionNameInput = document.getElementById('scrapeSessionName');
    const scrapeSessName = scrapeSessionNameInput ? scrapeSessionNameInput.value.trim() : "";

    showLoader();
    if (!auto) disableAutoSearchControls();

    let fetchUrl = `/scrape?query=${encodeURIComponent(query)}&plz=${plz}&radius=${radius}&minPrice=${minPrice}&priceLimit=${priceLimit}&pages=${pages}&auto=${auto}&excludeWords=${encodeURIComponent(excludeWordsParam)}`;
    
    // Fügt die ausgewählte Kategorie hinzu
    if (selectedCategorySlug && selectedCategoryId) { 
        fetchUrl += `&categorySlug=${encodeURIComponent(selectedCategorySlug)}&categoryId=${encodeURIComponent(selectedCategoryId)}`; 
        
        // NEU: Hängt die spezifischen Auto-Filter an, wenn die Kategorie "autos" ist
        if (selectedCategorySlug === 'autos') {
            const carParams = {
                kmMin: 'kmMin',
                kmMax: 'kmMax',
                ezMin: 'ezMin',
                ezMax: 'ezMax',
                powerMin: 'powerMin',
                powerMax: 'powerMax',
                tuevMin: 'tuevMin'
            };

            for (const paramName in carParams) {
                const elementId = carParams[paramName];
                const value = document.getElementById(elementId)?.value || "";
                if (value) {
                    fetchUrl += `&${paramName}=${encodeURIComponent(value)}`;
                }
            }
        }
    }

    if (shouldSaveResults) { 
        fetchUrl += `&saveResults=true`; 
        if (scrapeSessName) { fetchUrl += `&sessionName=${encodeURIComponent(scrapeSessName)}`; }
    }

    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            if (response.status === 401) { 
                showUserMessage("Sitzung abgelaufen oder nicht angemeldet. Bitte neu einloggen.", "error"); 
                logoutUser(); 
                hideLoader(); 
                enableAutoSearchControls(); 
                return; 
            }
            const errorData = await response.json().catch(() => ({ message: `HTTP-Fehler! Status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP-Fehler! Status: ${response.status}`);
        }
        const data = await response.json();
        const container = document.getElementById("results");
        if (!container) { hideLoader(); return; }
        container.innerHTML = ""; 
        hideLoader(); 
        if (!auto) enableAutoSearchControls();

        if (data.message && !Array.isArray(data)) { 
            container.innerHTML = `<div class="result-card card-message"><div class="card-content"><p>${data.message}</p></div></div>`; 
            return; 
        }
        if (!Array.isArray(data) || data.length === 0) { 
            container.innerHTML = `<div class="result-card card-message"><div class="card-content"><p>Keine Angebote für Ihre Suche gefunden.</p></div></div>`; 
            return; 
        }

        data.forEach(offer => {
            const div = document.createElement("div"); 
            div.className = "result-card card";
            const formattedPrice = offer.price > 0 ? `€${parseFloat(offer.price).toFixed(2)} (${offer.priceType||'Festpreis'})` : (offer.priceType==="VB"?"Preis VB":"Kein Preis");
            div.innerHTML = `
                ${offer.image?`<img src="${offer.image}" alt="${offer.title||'Angebot'}" class="card-image">`:'<div class="card-image-placeholder">Kein Bild</div>'}
                <div class="card-content">
                    <h2>${offer.title||'Unbekannter Titel'}</h2>
                    <p><strong>Preis:</strong> ${formattedPrice}</p>
                    <p><strong>Standort:</strong> ${offer.location||'Unbekannt'}</p>
                    <p><strong>Score:</strong> ${offer.score!==undefined?offer.score:'N/A'}</p>
                    <a href="${offer.url||'#'}" target="_blank" rel="noopener noreferrer" class="card-link">Zum Angebot <i class="fas fa-external-link-alt"></i></a>
                </div>`;
            container.appendChild(div);
        });

        if (shouldSaveResults) { 
            showUserMessage("Ergebnisse zur Speicherung an den Server gesendet.", "success"); 
            if(scrapeSessionNameInput) scrapeSessionNameInput.value = ""; 
            if(saveResultsCheckbox) saveResultsCheckbox.checked = false;
        }

        const autoCheckbox = document.getElementById("autoSearchToggle");
        if (autoCheckbox && autoCheckbox.checked && !auto) {
            let seconds = parseInt(document.getElementById("autoInterval")?.value || "60"); 
            if (isNaN(seconds) || seconds < 5) seconds = 60;
            clearInterval(autoSearchIntervalId);
            autoSearchIntervalId = setInterval(() => { 
                console.log("Client Auto-Suche wird ausgeführt..."); 
                fetchOffers(true); 
            }, seconds * 1000);
            console.log(`🚀 Client Auto-Suche alle ${seconds} Sekunden aktiviert.`);
        } else if (!autoCheckbox || !autoCheckbox.checked) { 
            clearInterval(autoSearchIntervalId); 
        }
    } catch (err) { 
        console.error("❌ Fehler bei der Hauptsuche:", err); 
        hideLoader(); 
        if (!auto) enableAutoSearchControls(); 
        const container = document.getElementById("results"); 
        if(container) container.innerHTML = `<p class="error-message">Fehler: ${err.message}. Versuchen Sie es später erneut.</p>`;
    }
};

window.cancelSearch = async function() {
    clearInterval(autoSearchIntervalId);
    const autoToggle = document.getElementById('autoSearchToggle');
    if(autoToggle) autoToggle.checked = false;
    enableAutoSearchControls(); 
    showLoader();
    try {
        const response = await fetch('/cancel', { method: 'POST' }); 
        const data = await response.json();
        console.log(data.message); 
        hideLoader(); 
        showUserMessage(data.message || "Abbruchanfrage gesendet.", "success");
    } catch (err) { 
        console.error("Fehler Abbrechen:", err); 
        hideLoader(); 
        showUserMessage("Fehler beim Abbrechen der Suche.", "error");
    }
};

function selectCategory(element) {
    // ... (dein bisheriger Code zum Setzen der Kategorie-Infos)
    const categoryName = element.dataset.categoryName;
    const categorySlug = element.dataset.categorySlug;
    const categoryId = element.dataset.categoryId;

    // Globale Variablen oder ein Objekt zum Speichern der Auswahl
    window.selectedCategory = {
        name: categoryName,
        slug: categorySlug,
        id: categoryId
    };
    
    document.getElementById('selectedCategoryNameText').textContent = categoryName;
    document.getElementById('selectedCategoryContainer').style.display = 'flex';
    toggleCategoryMenu(); // Menü schließen

    // NEU: Logik zum Ein-/Ausblenden der Auto-Filter
    const carFilters = document.getElementById('car-specific-filters');
    if (categorySlug === 'autos') {
        carFilters.style.display = 'block'; // Anzeigen, wenn "Autos" ausgewählt ist
    } else {
        carFilters.style.display = 'none';  // Bei allen anderen Kategorien ausblenden
    }
}

// --- UI Hilfsfunktionen und Menü-Funktionen ---
function showLoader() { 
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'flex'; 
}
function hideLoader() { 
    const loader = document.getElementById('loader');
    if(loader) loader.style.display = 'none'; 
}
function disableAutoSearchControls() { 
    const cb=document.getElementById("autoSearchToggle"); 
    const inp=document.getElementById("autoInterval"); 
    if(cb)cb.disabled=true; 
    if(inp){inp.disabled=true; inp.style.opacity="0.5";} 
}
function enableAutoSearchControls() { 
    const cb=document.getElementById("autoSearchToggle"); 
    const inp=document.getElementById("autoInterval"); 
    if(cb)cb.disabled=false; 
    if(inp){inp.disabled=!(cb&&cb.checked); inp.style.opacity=(cb&&cb.checked)?"1":"0.5";} 
}
window.quickSearch = function(keyword) { 
    const qI=document.getElementById('query'); 
    if(qI)qI.value=keyword; 
    navigateToView('mainSearchView'); 
    fetchOffers(); 
};
window.toggleAutoSearch = function(checkbox) { 
    const iI=document.getElementById('autoInterval'); 
    if(!iI)return; 
    if(checkbox.checked){
        iI.disabled=false; 
        iI.style.opacity="1";
    } else {
        iI.disabled=true; 
        iI.style.opacity="0.5"; 
        clearInterval(autoSearchIntervalId); 
        console.log("⛔ Client Auto-Suche gestoppt.");
    }
};
// Diese Funktion in script.js sicherstellen oder ersetzen
window.toggleFilters = function(filterContainerId, buttonElement) {
    // Zur Fehlersuche eine Nachricht in der Konsole ausgeben
    console.log(`toggleFilters aufgerufen für die ID: ${filterContainerId}`);

    const filterContainer = document.getElementById(filterContainerId);
    
    if (!filterContainer || !buttonElement) {
        console.error("Debug: Filter-Container oder Button wurde nicht gefunden!", { containerId: filterContainerId, buttonExists: !!buttonElement });
        return; 
    }
    
    // Schaltet die Klasse 'hidden' für den Container an/aus
    filterContainer.classList.toggle('hidden'); 
    
    // Schaltet die Klasse 'open' für den Button an/aus (für die Pfeil-Animation)
    buttonElement.classList.toggle('open');
};
window.toggleCategoryMenu = function() { 
    const m=document.getElementById('categoryMenu'); 
    const b=document.body; 
    if(!m)return; 
    m.classList.toggle('show'); 
    b.classList.toggle('category-menu-open');
};
window.toggleSubmenu = function(el) { 
    const sm=el.nextElementSibling; 
    const ic=el.querySelector('i.fas.fa-chevron-down'); 
    if(!sm)return; 
    const cO=sm.classList.contains('open'); 
    const pU=el.closest('aside#categoryMenu > ul'); 
    if(pU){
        pU.querySelectorAll('.submenu.open').forEach(oS=>{
            oS.classList.remove('open'); 
            const pT=oS.previousElementSibling; 
            if(pT&&pT.classList.contains('category-title')) pT.classList.remove('open');
        });
    } 
    if(!cO){
        sm.classList.add('open'); 
        if(ic) el.classList.add('open');
    }
};
// --- KATEGORIE-FUNKTIONEN (KORRIGIERTE VERSION) ---

/**
 * Wählt eine Kategorie aus, setzt die globalen Variablen und blendet die
 * spezifischen Auto-Filter bei Bedarf ein oder aus.
 * @param {HTMLElement} element - Das angeklickte <li> Element der Kategorie.
 */
window.selectCategory = function(element) { 
    // 1. Daten aus dem HTML-Element auslesen
    selectedCategoryName = element.dataset.categoryName; 
    selectedCategorySlug = element.dataset.categorySlug; 
    selectedCategoryId = element.dataset.categoryId; 
    
    // 2. UI-Elemente für die Anzeige der Auswahl aktualisieren
    const nameTextElement = document.getElementById('selectedCategoryNameText'); 
    const containerElement = document.getElementById('selectedCategoryContainer'); 
    if (nameTextElement) nameTextElement.textContent = selectedCategoryName; 
    if (containerElement) containerElement.style.display = 'flex'; 
    
    // 3. Spezifische Auto-Filter ein- oder ausblenden
    const carFilters = document.getElementById('car-specific-filters');
    if (carFilters) { // Sicherstellen, dass das Element existiert
        if (selectedCategorySlug === 'autos') {
            carFilters.style.display = 'block'; // Anzeigen, wenn "Autos" ausgewählt ist
        } else {
            carFilters.style.display = 'none';  // Bei allen anderen Kategorien ausblenden
        }
    }
    
    // 4. Kategorien-Menü schließen
    toggleCategoryMenu();
};

/**
 * Hebt die Auswahl der Kategorie auf und blendet die Auto-Filter wieder aus.
 */
window.clearSelectedCategory = function() {
    // Globale Variablen zurücksetzen
    selectedCategoryName = null;
    selectedCategorySlug = null;
    selectedCategoryId = null;

    // UI-Anzeige zurücksetzen
    const container = document.getElementById('selectedCategoryContainer');
    if (container) container.style.display = 'none';

    // Sicherstellen, dass die Auto-Filter ausgeblendet werden
    const carFilters = document.getElementById('car-specific-filters');
    if (carFilters) carFilters.style.display = 'none';
}
function populateMonitorCategorySelect() {
    const mainCategorySelect = document.getElementById('categoryMenu'); // Das Hauptmenü
    const monitorCategorySelect = document.getElementById('monitorCategory');
    if (!mainCategorySelect || !monitorCategorySelect) return;

    monitorCategorySelect.innerHTML = '<option value="">Alle Kategorien</option>'; // Reset

    const allCategories = mainCategorySelect.querySelectorAll('li[data-category-id]');
    allCategories.forEach(catLi => {
        const option = document.createElement('option');
        const categoryData = catLi.dataset;
        option.value = `${categoryData.categorySlug}|${categoryData.categoryId}|${categoryData.categoryName}`;
        option.textContent = catLi.textContent;
        monitorCategorySelect.appendChild(option);
    });
}
function toggleMonitorCarFilters(selectElement) {
    const carFilters = document.getElementById('monitor-car-specific-filters');
    const selectedValue = selectElement.value;
    
    if (selectedValue && selectedValue.startsWith('autos|')) {
        carFilters.style.display = 'block';
    } else {
        carFilters.style.display = 'none';
    }
}