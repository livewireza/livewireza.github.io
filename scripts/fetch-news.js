import Parser from "rss-parser";
import fs from "fs";

const parser = new Parser();

const feeds = [
  "https://feeds.bbci.co.uk/news/rss.xml",
  "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
  "https://www.theguardian.com/world/rss"
];

let articles = [];

for (const feed of feeds) {
  try {
    const result = await parser.parseURL(feed);

    const items = result.items.slice(0, 10).map(item => ({
      title: item.title,
      link: item.link,
      source: result.title,
      published: item.pubDate
    }));

    articles.push(...items);

  } catch (err) {
    console.log(err.message);
  }
}

articles.sort(
  (a, b) => new Date(b.published) - new Date(a.published)
);

fs.writeFileSync(
  "./data/news.json",
  JSON.stringify(articles, null, 2)
);

console.log(`Saved ${articles.length} articles`);
