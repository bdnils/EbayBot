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
            await checkAuthStatusAndInitializeApp();
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
window.saveCurrentSearch = async function() {
    if (!currentUserId) { showUserMessage("Bitte zuerst einloggen.", "error"); return; }
    const searchNameInput = document.getElementById('searchNameToSave');
    const search_name = searchNameInput?.value.trim();
    if (!search_name) { showUserMessage("Bitte Namen für Suche eingeben.", "error"); searchNameInput?.focus(); return; }
    
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

    try {
        const response = await fetch('/api/saved-searches', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(searchParams) });
        const data = await response.json();
        if(data.success){ showUserMessage(`Suche "${search_name}" gespeichert!`, 'success'); if(searchNameInput) searchNameInput.value=''; loadSavedSearches(); }
        else { showUserMessage(data.message || "Fehler Speichern.", "error");}
    } catch (err) { console.error("Fehler saveCurrentSearch:", err); showUserMessage("Netzwerkfehler Speichern.", "error");}
};

async function loadSavedSearches() {
    if (!currentUserId) return;
    const listElement = document.getElementById('savedSearchesList');
    const sectionElement = document.getElementById('savedSearchesSection');
    const noSearchesMsg = document.getElementById('noSavedSearches');
    if (!listElement || !sectionElement || !noSearchesMsg) return;

    try {
        const response = await fetch('/api/saved-searches');
        if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        listElement.innerHTML = ''; 
        if (data.success && data.searches.length > 0) {
            sectionElement.style.display = 'block'; noSearchesMsg.style.display = 'none';
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
            sectionElement.style.display = 'block'; noSearchesMsg.style.display = 'block';
            noSearchesMsg.textContent = 'Noch keine Suchen gespeichert.';
        } else { 
            showUserMessage(data.message || "Gespeicherte Suchen konnten nicht geladen werden.", "error"); 
            if(sectionElement) sectionElement.style.display = 'none';
        }
    } catch (err) { 
        console.error("Fehler loadSavedSearches:", err); 
        showUserMessage("Netzwerkfehler beim Laden der Suchen.", "error"); 
        if (sectionElement) sectionElement.style.display = 'none';
    }
}

window.applySavedSearch = function(event, searchData) {
    try {
        document.getElementById('query').value = searchData.query || "";
        const pagesInput = document.getElementById('pages');
        if(pagesInput) pagesInput.value = searchData.pages || 10;
        
        const plzInput = document.getElementById('plz');
        if(plzInput) plzInput.value = searchData.plz || "";
        
        const radiusSelect = document.getElementById('radius');
        if(radiusSelect) radiusSelect.value = searchData.radius || "0";
        
        const minPriceInput = document.getElementById('minPrice');
        if(minPriceInput) minPriceInput.value = searchData.min_price || "";
        
        const priceLimitInput = document.getElementById('priceLimit');
        if(priceLimitInput) priceLimitInput.value = searchData.price_limit || "";

        userExcludeWords = new Set(searchData.exclude_words ? searchData.exclude_words.split(',') : defaultExcludeWords);
        renderExcludeWords();

        if (searchData.category_id && searchData.category_slug) {
            selectedCategoryId = searchData.category_id;
            selectedCategorySlug = searchData.category_slug;
            selectedCategoryName = searchData.category_name || searchData.category_slug; 
            
            const selectedCatNameText = document.getElementById('selectedCategoryNameText');
            if(selectedCatNameText) selectedCatNameText.textContent = selectedCategoryName;
            
            const selectedCatContainer = document.getElementById('selectedCategoryContainer');
            if(selectedCatContainer) selectedCatContainer.style.display = 'flex';
        } else { 
            clearSelectedCategory(); 
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
    const plzInput = document.getElementById('monitorPlz');
    const radiusSelect = document.getElementById('monitorRadius');
    
    const search_name = searchNameInput?.value.trim();
    const query = queryInput?.value.trim();

    if (!search_name || !query) {
        showUserMessage("Name und Suchbegriff für Überwachung sind Pflicht.", "error");
        return;
    }

    const query_params = {
        query: query,
        plz: plzInput?.value.trim() || null,
        radius: radiusSelect?.value || "0",
        excludeWords: [...userExcludeWords].join(','),
        pages: 2 
    };

    try {
        const response = await fetch('/api/monitored-searches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ search_name, query_params })
        });
        const data = await response.json();
        if (data.success) {
            showUserMessage(`Überwachung "${search_name}" hinzugefügt.`, "success");
            if(searchNameInput) searchNameInput.value = '';
            if(queryInput) queryInput.value = '';
            if(plzInput) plzInput.value = '';
            if(radiusSelect) radiusSelect.value = "0";
            loadMonitoredSearches();
        } else {
            showUserMessage(data.message || "Fehler Hinzufügen Überwachung.", "error");
        }
    } catch (err) {
        console.error("Fehler addMonitoredSearch:", err);
        showUserMessage("Netzwerkfehler Hinzufügen Überwachung.", "error");
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
    if (selectedCategorySlug && selectedCategoryId) { 
        fetchUrl += `&categorySlug=${encodeURIComponent(selectedCategorySlug)}&categoryId=${encodeURIComponent(selectedCategoryId)}`; 
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
window.toggleFilters = function() { 
    const f=document.getElementById('advanced-filters'); 
    const b=document.querySelector('.toggle-filters-button'); 
    if(!f||!b)return; 
    f.classList.toggle('hidden'); 
    b.classList.toggle('open');
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
window.selectCategory = function(el) { 
    selectedCategoryName=el.dataset.categoryName; 
    selectedCategorySlug=el.dataset.categorySlug; 
    selectedCategoryId=el.dataset.categoryId; 
    const nTE=document.getElementById('selectedCategoryNameText'); 
    const cE=document.getElementById('selectedCategoryContainer'); 
    if(nTE)nTE.textContent=selectedCategoryName; 
    if(cE)cE.style.display='flex'; 
    toggleCategoryMenu();
};
window.clearSelectedCategory = function() {
    selectedCategoryName=null;
    selectedCategorySlug=null;
    selectedCategoryId=null; 
    const cE=document.getElementById('selectedCategoryContainer'); 
    const nTE=document.getElementById('selectedCategoryNameText'); 
    if(cE)cE.style.display='none'; 
    if(nTE)nTE.textContent='';
};