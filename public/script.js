function fetchOffers() {
    const query = document.getElementById("query").value;

    fetch('/scrape?query=' + encodeURIComponent(query))
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById("results");
            container.innerHTML = '';

            data.forEach(offer => {
                const div = document.createElement("div");
                div.className = "card";

                // Preis korrekt formatieren mit 2 Dezimalstellen
                const formattedPrice = offer.price > 0 ? `€${offer.price.toFixed(2)}` : "Preis nicht erkennbar";

                div.innerHTML = `
                    <h2>${offer.title}</h2>
                    <p><strong>Preis:</strong> ${formattedPrice}</p>
                    <p><strong>Standort:</strong> ${offer.location}</p>
                    <p><strong>Score:</strong> ${offer.score}</p>
                    <a href="${offer.url}" target="_blank">Zum Angebot</a>
                `;
                container.appendChild(div);
            });
        });
}
