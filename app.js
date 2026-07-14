async function loadNews() {

    const response = await fetch("./data/news.json");
    const news = await response.json();

    const container = document.getElementById("news");

    container.innerHTML = "";

    news.forEach(article => {

        const card = document.createElement("div");
        card.className = "card";

        card.innerHTML = `
            <h2>${article.title}</h2>
            <small>${article.source}</small>
            <p>${new Date(article.published).toLocaleString()}</p>
            <a href="${article.link}" target="_blank">
                Read article
            </a>
        `;

        container.appendChild(card);

    });

}

loadNews();
