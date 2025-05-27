// Globale Variablen für die ausgewählte Kategorie
let selectedCategoryName = null;
let selectedCategorySlug = null;
let selectedCategoryId = null;

window.addEventListener('DOMContentLoaded', () => {
    let autoSearchInterval;

    const defaultExcludeWords = [
        "gaming pc", "rechner", "laptop", "notebook", "setup", "system", "komplett",
        "bundle", "monitor", "mainboard", "computer", "tower", "suche", "tausche",
        "tauschen", "miete", "mieten", "verleihen", "defekt", "kaputt"
    ];
    let excludeWords = new Set(defaultExcludeWords);

    function renderExcludeWords() {
        const container = document.getElementById("exclude-word-list");
        if (!container) return; // Sicherstellen, dass das Element existiert
        container.innerHTML = "";

        defaultExcludeWords.forEach(word => {
            const span = document.createElement("span");
            span.textContent = word;
            span.classList.add("word-tag"); // Geänderte Klasse für konsistenteres Styling
            if (excludeWords.has(word)) {
                span.classList.add("active");
            }

            span.addEventListener("click", () => {
                if (excludeWords.has(word)) {
                    excludeWords.delete(word);
                } else {
                    excludeWords.add(word);
                }
                renderExcludeWords();
            });
            container.appendChild(span);
        });

        [...excludeWords].forEach(word => {
            if (!defaultExcludeWords.includes(word)) {
                const span = document.createElement("span");
                span.textContent = word;
                span.classList.add("word-tag"); // Geänderte Klasse
                span.classList.add("active"); // Eigene Wörter sind immer aktiv, bis sie entfernt werden

                span.addEventListener("click", () => {
                    excludeWords.delete(word);
                    renderExcludeWords();
                });
                container.appendChild(span);
            }
        });
    }

    function addCustomExclude() {
        const input = document.getElementById("customExclude");
        if (!input) return;
        const word = input.value.trim().toLowerCase();
        if (word && !excludeWords.has(word)) {
            excludeWords.add(word);
            renderExcludeWords();
            input.value = "";
        }
    }

    function quickSearch(keyword) {
        const queryInput = document.getElementById('query');
        if (queryInput) queryInput.value = keyword;
        fetchOffers();
    }

    function showLoader() {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'flex';
    }

    function hideLoader() {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';
    }

    function cancelSearch() {
        showLoader();
        fetch('/cancel', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                console.log(data.message);
                hideLoader();
                clearInterval(autoSearchInterval);
                enableAutoSearchControls();
                alert("✅ Suche wurde abgebrochen.");
            })
            .catch(err => {
                console.error("Fehler beim Abbrechen:", err);
                hideLoader();
                alert("⚠️ Keine Suche zum Abbrechen gefunden.");
            });
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
            input.disabled = !(checkbox && checkbox.checked);
            input.style.opacity = (checkbox && checkbox.checked) ? "1" : "0.5";
        }
    }

    window.fetchOffers = function(auto = false) { // Global machen für onclick
        const query = document.getElementById('query')?.value || "";
        const plz = document.getElementById('plz')?.value || "";
        const radius = document.getElementById('radius')?.value || "0";
        const minPrice = document.getElementById('minPrice')?.value || "";
        const priceLimit = document.getElementById('priceLimit')?.value || "";
        const pages = document.getElementById('pages')?.value || 1;
        const email = document.getElementById('email')?.value || "";
        const excludeWordsParam = [...excludeWords].join(',');

        showLoader();
        disableAutoSearchControls();

        let fetchUrl = `/scrape?query=${encodeURIComponent(query)}&plz=${plz}&radius=${radius}&minPrice=${minPrice}&priceLimit=${priceLimit}&pages=${pages}&email=${encodeURIComponent(email)}&auto=${auto}&excludeWords=${encodeURIComponent(excludeWordsParam)}`;

        if (selectedCategorySlug && selectedCategoryId) {
            fetchUrl += `&categorySlug=${encodeURIComponent(selectedCategorySlug)}`;
            fetchUrl += `&categoryId=${encodeURIComponent(selectedCategoryId)}`;
        }

        fetch(fetchUrl)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP error! status: ${res.status}`);
                }
                return res.json();
            })
            .then(data => {
                const container = document.getElementById("results");
                if (!container) return;
                container.innerHTML = ""; // Alte Ergebnisse löschen
                hideLoader();

                if (data.message && data.length === undefined) { // Fehler vom Server oder keine Ergebnisse
                    const div = document.createElement("div");
                    div.className = "result-card card-message"; // Eigene Klasse für Nachrichten
                    div.innerHTML = `<div class="card-content"><p>${data.message}</p></div>`;
                    container.appendChild(div);
                    return;
                }
                if (data.length === 0) {
                     const div = document.createElement("div");
                    div.className = "result-card card-message";
                    div.innerHTML = `<div class="card-content"><p>Keine Angebote für Ihre Suche gefunden.</p></div>`;
                    container.appendChild(div);
                    return;
                }


                // Filterung nach Ausschlusswörtern clientseitig (optional, da Server es auch machen könnte)
                const clientFilteredData = data.filter(offer => {
                     const title = offer.title ? offer.title.toLowerCase() : "";
                     return ![...excludeWords].some(word => title.includes(word));
                });


                clientFilteredData.forEach(offer => {
                    const div = document.createElement("div");
                    div.className = "result-card card"; // Zusätzliche Klasse für Ergebnis-Karten

                    const formattedPrice = offer.price > 0
                        ? `€${parseFloat(offer.price).toFixed(2)} (${offer.priceType || 'Festpreis'})`
                        : "Preis VB oder nicht erkannt";

                    div.innerHTML = `
                        ${offer.image ? `<img src="${offer.image}" alt="${offer.title || 'Angebot'}" class="card-image">` : '<div class="card-image-placeholder">Kein Bild</div>'}
                        <div class="card-content">
                            <h2>${offer.title || 'Unbekannter Titel'}</h2>
                            <p><strong>Preis:</strong> ${formattedPrice}</p>
                            <p><strong>Standort:</strong> ${offer.location || 'Unbekannt'}</p>
                            <p><strong>Score:</strong> ${offer.score !== undefined ? offer.score : 'N/A'}</p>
                            <a href="${offer.url || '#'}" target="_blank" class="card-link">Zum Angebot <i class="fas fa-external-link-alt"></i></a>
                        </div>
                    `;
                    container.appendChild(div);
                });

                const autoCheckbox = document.getElementById("autoSearchToggle");
                if (autoCheckbox && autoCheckbox.checked) {
                    let seconds = parseInt(document.getElementById("autoInterval")?.value || "60");
                    if (isNaN(seconds) || seconds < 5) seconds = 60;

                    clearInterval(autoSearchInterval);
                    autoSearchInterval = setInterval(() => {
                        fetchOffers(true);
                    }, seconds * 1000);
                    console.log(`🚀 Auto-Suche aktiviert (alle ${seconds} Sekunden)`);
                } else {
                    clearInterval(autoSearchInterval);
                }
            })
            .catch(err => {
                console.error("❌ Fehler bei der Suche:", err);
                hideLoader();
                const container = document.getElementById("results");
                if(container) container.innerHTML = `<p class="error-message">Fehler: ${err.message}. Bitte versuchen Sie es später erneut.</p>`;
                enableAutoSearchControls();
            });
    }

    window.toggleAutoSearch = function(checkbox) { // Global machen
        const intervalInput = document.getElementById('autoInterval');
        if (!intervalInput) return;
        if (checkbox.checked) {
            intervalInput.disabled = false;
            intervalInput.style.opacity = "1";
        } else {
            intervalInput.disabled = true;
            intervalInput.style.opacity = "0.5";
            clearInterval(autoSearchInterval);
            console.log("⛔ Auto-Suche gestoppt.");
        }
    }

    window.toggleFilters = function() { // Global machen
        const filters = document.getElementById('advanced-filters');
        const button = document.querySelector('.toggle-filters-button');
        if (!filters || !button) return;

        filters.classList.toggle('hidden');
        button.classList.toggle('open'); // Für Pfeilrotation

        // Optional: Text des Buttons ändern, aber das überschreibt das Icon
        // if (filters.classList.contains('hidden')) {
        //     button.innerHTML = '<i class="fas fa-filter"></i> Erweiterte Filter <span class="filter-arrow"><i class="fas fa-chevron-down"></i></span>';
        // } else {
        //     button.innerHTML = '<i class="fas fa-filter"></i> Erweiterte Filter <span class="filter-arrow open"><i class="fas fa-chevron-down"></i></span>';
        // }
    }

    // Set default value für Intervalleingabe
    const autoIntervalInput = document.getElementById("autoInterval");
    if (autoIntervalInput) {
        autoIntervalInput.placeholder = "60"; // Standard als Platzhalter
        autoIntervalInput.disabled = true; // Initial deaktiviert
        autoIntervalInput.style.opacity = "0.5";
    }


    renderExcludeWords();
    window.quickSearch = quickSearch;
    // window.fetchOffers ist schon global
    window.cancelSearch = cancelSearch;
    // window.toggleAutoSearch ist schon global
    window.addCustomExclude = addCustomExclude;
    // window.toggleFilters ist schon global
});

// ANGEPASSTE FUNKTION: toggleSubmenu
window.toggleSubmenu = function(element) { // element ist das <span class="category-title">
    const submenu = element.nextElementSibling; // Holt das <ul> Geschwisterelement
    const iconElement = element.querySelector('i.fas.fa-chevron-down'); // Holt das Pfeil-Icon

    if (!submenu) return;

    if (submenu.classList.contains('open')) {
        submenu.classList.remove('open');
        if (iconElement) element.classList.remove('open'); // Klasse vom Titel entfernen für Pfeil
    } else {
        // Optional: Alle anderen offenen Submenüs in DIESEM Menü schließen (Accordion-Effekt)
        const parentUl = element.closest('ul'); // Das äußere <ul>, das die <li> mit .category-title enthält
        if (parentUl) {
            parentUl.querySelectorAll('.submenu.open').forEach(openSub => {
                if (openSub !== submenu) { // Nicht das aktuell zu öffnende schließen
                    openSub.classList.remove('open');
                    const prevTitle = openSub.previousElementSibling;
                    if (prevTitle && prevTitle.classList.contains('category-title')) {
                        prevTitle.classList.remove('open');
                    }
                }
            });
        }
        submenu.classList.add('open');
        if (iconElement) element.classList.add('open'); // Klasse zum Titel hinzufügen für Pfeil
    }
}


window.toggleCategoryMenu = function() { // Global machen
    const menu = document.getElementById('categoryMenu');
    const body = document.body;
    if (!menu) return;
    menu.classList.toggle('show');
    body.classList.toggle('category-menu-open'); // Für potenzielles Styling des Body (z.B. kein Scrollen)
}

window.selectCategory = function(element) { // Global machen
    selectedCategoryName = element.dataset.categoryName;
    selectedCategorySlug = element.dataset.categorySlug;
    selectedCategoryId = element.dataset.categoryId;

    const nameTextElem = document.getElementById('selectedCategoryNameText');
    const containerElem = document.getElementById('selectedCategoryContainer');

    if (nameTextElem) nameTextElem.textContent = selectedCategoryName;
    if (containerElem) containerElem.style.display = 'flex'; // Geändert zu flex für bessere Ausrichtung

    // Menü schließen nach Auswahl
    toggleCategoryMenu();
    // Optional: Suche direkt starten
    // fetchOffers();
}

window.clearSelectedCategory = function() { // Global machen
    selectedCategoryName = null;
    selectedCategorySlug = null;
    selectedCategoryId = null;

    const containerElem = document.getElementById('selectedCategoryContainer');
    const nameTextElem = document.getElementById('selectedCategoryNameText');

    if (containerElem) containerElem.style.display = 'none';
    if (nameTextElem) nameTextElem.textContent = '';
    // Optional: Suche aktualisieren
    // fetchOffers();
}