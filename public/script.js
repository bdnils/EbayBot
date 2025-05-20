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
        container.innerHTML = "";

        defaultExcludeWords.forEach(word => {
            const span = document.createElement("span");
            span.textContent = word;
            span.classList.add("word");
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
                span.classList.add("active");

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
        const word = input.value.trim().toLowerCase();
        if (word && !excludeWords.has(word)) {
            excludeWords.add(word);
            renderExcludeWords();
            input.value = "";
        }
    }

    function quickSearch(keyword) {
        document.getElementById('query').value = keyword;
        fetchOffers();
    }

    function showLoader() {
        document.getElementById('loader').style.display = 'flex';
    }

    function hideLoader() {
        document.getElementById('loader').style.display = 'none';
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
        checkbox.disabled = true;
        input.disabled = true;
        input.style.opacity = "0.5";
    }

    function enableAutoSearchControls() {
        const checkbox = document.getElementById("autoSearchToggle");
        const input = document.getElementById("autoInterval");
        checkbox.disabled = false;
        input.disabled = !checkbox.checked;
        input.style.opacity = checkbox.checked ? "1" : "0.5";
    }

    function fetchOffers(auto = false) {
        const query = document.getElementById('query').value;
        const plz = document.getElementById('plz').value;
        const radius = document.getElementById('radius').value;
        const minPrice = document.getElementById('minPrice')?.value || "";
        const priceLimit = document.getElementById('priceLimit')?.value || "";
        const pages = document.getElementById('pages')?.value || 1;
        const email = document.getElementById('email')?.value || "";
        const excludeWordsParam = [...excludeWords].join(',');

        showLoader();
        disableAutoSearchControls();

        fetch(`/scrape?query=${encodeURIComponent(query)}&plz=${plz}&radius=${radius}&minPrice=${minPrice}&priceLimit=${priceLimit}&pages=${pages}&email=${encodeURIComponent(email)}&auto=${auto}&excludeWords=${encodeURIComponent(excludeWordsParam)}`)
            .then(res => res.json())
            .then(data => {
                const container = document.getElementById("results");
                container.innerHTML = "";
                hideLoader();

                const filteredData = data.filter(offer => {
                    const title = offer.title.toLowerCase();
                    return ![...excludeWords].some(word => title.includes(word));
                });

                filteredData.forEach(offer => {
                    const div = document.createElement("div");
                    div.className = "card";

                    const formattedPrice = offer.price > 0
                        ? `€${offer.price.toFixed(2)} (${offer.priceType})`
                        : "Preis nicht erkennbar";

                    div.innerHTML = `
                        <div style="display: flex; justify-content: space-between; flex-wrap: wrap;">
                            <div>
                                <h2>${offer.title}</h2>
                                <p><strong>Preis:</strong> ${formattedPrice}</p>
                                <p><strong>Standort:</strong> ${offer.location}</p>
                                <p><strong>Score:</strong> ${offer.score}</p>
                                <a href="${offer.url}" target="_blank">Zum Angebot</a>
                            </div>
                            ${offer.image ? `<img src="${offer.image}" style="width: 200px; border-radius: 12px;">` : ""}
                        </div>
                    `;
                    container.appendChild(div);
                });

                const autoCheckbox = document.getElementById("autoSearchToggle");
                if (autoCheckbox.checked) {
                    let seconds = parseInt(document.getElementById("autoInterval").value);
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
                alert("❌ Fehler beim Abrufen der Angebote.");
                enableAutoSearchControls();
            });
    }

    function toggleAutoSearch(checkbox) {
        const intervalInput = document.getElementById('autoInterval');
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

    function toggleFilters() {
        const filters = document.getElementById('advanced-filters');
        const button = document.querySelector('.toggle-button');
        if (filters.classList.contains('hidden')) {
            filters.classList.remove('hidden');
            button.textContent = '🔧 Filter verbergen';
        } else {
            filters.classList.add('hidden');
            button.textContent = '🔧 Filter anzeigen';
        }
    }

    // Set default value
    document.getElementById("autoInterval").placeholder = "Standard: 60";
    document.getElementById("autoInterval").value = "";

    renderExcludeWords();
    window.quickSearch = quickSearch;
    window.fetchOffers = fetchOffers;
    window.cancelSearch = cancelSearch;
    window.toggleAutoSearch = toggleAutoSearch;
    window.addCustomExclude = addCustomExclude;
    window.toggleFilters = toggleFilters;
});
