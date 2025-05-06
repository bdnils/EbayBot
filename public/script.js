function fetchOffers() {
    const query = document.getElementById("query").value;
    const loader = document.getElementById("loader");
    const container = document.getElementById("results");

    loader.style.display = 'block';    // Loader anzeigen
    container.innerHTML = '';          // Ergebnisse zurücksetzen

    fetch('/scrape?query=' + encodeURIComponent(query))
        .then(res => res.json())
        .then(data => {
            data.forEach(offer => {
                const div = document.createElement("div");
                div.className = "card";

                const formattedPrice = offer.price > 0
                    ? `€${offer.price.toFixed(2)} (${offer.priceType})`
                    : "Preis nicht erkennbar";

                div.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                        <div style="flex: 1 1 60%;">
                            <h2>${offer.title}</h2>
                            <p><strong>Preis:</strong> ${formattedPrice}</p>
                            <p><strong>Standort:</strong> ${offer.location}</p>
                            <p><strong>Score:</strong> ${offer.score}</p>
                            <a href="${offer.url}" target="_blank">Zum Angebot</a>
                        </div>
                        ${offer.image ? `
                            <img src="${offer.image}" alt="Bild"
                                 style="width: 240px; height: auto; object-fit: cover; border-radius: 12px; margin-left: 20px; margin-top: 10px;">
                        ` : ""}
                    </div>
                `;
                container.appendChild(div);
            });
        })
        .catch(err => {
            container.innerHTML = '<p>Fehler beim Laden der Angebote.</p>';
            console.error(err);
        })
        .finally(() => {
            loader.style.display = 'none'; // Loader wieder ausblenden
        });
}
