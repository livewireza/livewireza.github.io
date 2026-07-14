
async function loadNews() {
    const container = document.getElementById("news");

    try {
        console.log("Loading news...");

        const response = await fetch("./data/news.json");

        console.log("Response:", response.status);

        if (!response.ok) {
            throw new Error(`Failed to load news.json (${response.status})`);
        }

        const news = await response.json();

        console.log("Articles loaded:", news.length);

        if (!news.length) {
            container.innerHTML = "<p>No news available.</p>";
            return;
        }

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

    } catch (error) {
        console.error("News loading error:", error);
        container.innerHTML =
            `<p>Error loading news: ${error.message}</p>`;
    }
}

document.addEventListener("DOMContentLoaded", loadNews);
