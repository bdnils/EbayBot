window.addEventListener('DOMContentLoaded', () => {
    function quickSearch(keyword) {
        document.getElementById('query').value = keyword;
        fetchOffers();
    }

    let autoSearchInterval;

    function fetchOffers(auto = false) {
        const query = document.getElementById('query').value;
        const plz = document.getElementById('plz').value;
        const radius = document.getElementById('radius').value;
        const priceLimit = document.getElementById('priceLimit').value;
        const pages = document.getElementById('pages').value || 1;  // Defaultwert 1, wenn nicht gesetzt
        const email = document.getElementById('email').value;
        const loader = document.getElementById('loader');
        loader.style.display = "block";

        fetch(`/scrape?query=${encodeURIComponent(query)}&plz=${plz}&radius=${radius}&priceLimit=${priceLimit}&pages=${pages}&email=${encodeURIComponent(email)}&auto=${auto}`)
            .then(res => res.json())
            .then(data => {
                const container = document.getElementById("results");
                container.innerHTML = "";
                loader.style.display = "none";

                data.forEach(offer => {
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
            });
    }

    function toggleAutoSearch(checkbox) {
        if (checkbox.checked) {
            fetchOffers(true); // initial
            autoSearchInterval = setInterval(() => fetchOffers(true), 5 * 60 * 1000);
        } else {
            clearInterval(autoSearchInterval);
        }
    }

    // Global verfügbar machen (optional, damit onclick im HTML funktioniert)
    window.quickSearch = quickSearch;
    window.fetchOffers = fetchOffers;
    window.toggleAutoSearch = toggleAutoSearch;
});
