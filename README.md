# Wiho's Portal — GitHub Actions edition

A replica of [wihome.net](https://wihome.net) ("WIHO'S PORTAL") that needs **no server**: a
scheduled GitHub Actions workflow collects the news feeds and daily comics, builds a static
React site and publishes it on GitHub Pages.

| Page          | What it does                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **News**      | NOS, NU.nl, RTV Utrecht, CNN, Hacker News, Retro Computing, Tweakers, Phoronix and Slashdot in draggable columns, with yellow summary pop-ups |
| **Comics**    | An infinitely scrolling stream of xkcd, SMBC, Garfield, Calvin & Hobbes, Bizarro, Wulffmorgenthaler and Fokke & Sukke                           |
| **Bookmarks** | The original link boxes (Linux, Web development, Coding, …)                                                                                    |

Everything the original does in the browser still works:
- Drag boxes between columns.
- Close a box with the red ✕ that appears on hover.
- Choose 1–5 columns or re-add closed boxes in the ⚙ preferences.
- Headlines that are new since your last visit get a red bullet.
- `?m` turns on mobile mode (summaries below the headlines).
- Dark mode follows your system.

Preferences are stored in `localStorage` (the original used cookies).

## How it works

```
 every 30 min ┌──────────────────────────── GitHub Actions ─────────────────────────────┐
 ───────────▶ │ 1. download previous data/*.json from the live site (comic history)     │
              │ 2. node scripts/update-data.mjs  → fetch RSS/Atom feeds + comics        │
              │ 3. npm run build                 → dist/index.html (data bundled in)    │
              │ 4. deploy dist/ (+ data/*.json) to GitHub Pages                         │
              └─────────────────────────────────────────────────────────────────────────┘
```

* **`src/site.config.json`** is the single source of truth: feeds, comic sources, bookmarks and default
  layouts. Both the fetch script and the website read it.
* **`scripts/update-data.mjs`** fetches everything and writes `src/data/news.json` and
  `src/data/comics.json`. A feed that is temporarily down keeps its last good headlines.
* State between runs comes from the previously deployed `data/*.json`, so the workflow never has
  to commit to your repository.
* Open browser tabs poll `data/*.json` every 5 minutes and update without a reload.
* The repository ships with a snapshot of wihome.net so the site looks right before the first run.

## Setup (about 2 minutes)

1. Push this project to a GitHub repository. Public repositories get unlimited Actions minutes.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Go to **Actions → Update portal → Run workflow**. Pushing to `main` works too.
4. When the run finishes, the site is at `https://<user>.github.io/<repo>/`. After that it refreshes
   itself every 30 minutes.

Each run writes a summary table showing which feeds and comics succeeded.

## Customising

Edit `src/site.config.json` and push. The workflow redeploys on every push to `main`.

**News feeds** (`news.feeds`): any RSS 2.0, RSS 1.0/RDF or Atom feed.

```json
{ "id": "bbc", "title": "BBC News", "link": "https://www.bbc.com/news", "url": "https://feeds.bbci.co.uk/news/rss.xml" }
```

| Option                  | Meaning                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `maxItems`              | Headlines to keep (default 14).                                      |
| `showDescription`       | `false` hides the summary pop-up (used for NOS, HN and Slashdot).    |
| `titleDomain`           | Appends `(domain.com)` to titles, Hacker News style.                 |
| `commentsAsDescription` | Shows a "Comments" link (from `<comments>`) instead of a summary.    |

Feeds that are not in `news.defaultLayout` can still be added from the preferences dialog. NOS Sport,
BBC, Ars Technica, The Register and Hackaday are included as examples.

**Comics** (`comics.sources`), by `type`:

| Type       | Fields                                       | How the strip is found                                           |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `xkcd`     | —                                            | xkcd's JSON API                                                  |
| `rss`      | `url`                                        | first `<img>` of the newest feed item (SMBC)                     |
| `gocomics` | `slug`                                       | `og:image` of today's GoComics strip page                        |
| `page`     | `url`, optional `pattern` and `lookbackDays` | a regex match, otherwise `og:image`; URLs may use `{yyyy}-{mm}-{dd}` |
| `bluesky`  | `actor`                                      | newest image post of a Bluesky account (public API)              |

A strip is added to the history only when its image URL changes. Up to `maxHistory` strips are kept
(default 150).

**Bookmarks** (`bookmarks.groups`): plain lists of `{ "title", "url" }`.

To change the schedule, edit `cron` in `.github/workflows/portal.yml`. Then update the
`updateInterval` text in the config to match.

## Local development

```bash
npm install
node scripts/update-data.mjs   # fetch fresh data into src/data/
npm run dev                    # http://localhost:5173
npm run build                  # single-file build in dist/index.html
```

## Good to know

* **The schedule pauses after 60 days without activity** in public repositories. The workflow
  re-enables itself through the API on every scheduled run to prevent this. If it pauses anyway,
  press "Enable workflow" in the Actions tab.
* **Private repositories**: 48 runs a day of about 1 minute each uses roughly 1,450 Actions minutes a
  month. Consider `cron: "7 * * * *"` (hourly).
* **Scrapers can break.** GoComics and Comics Kingdom sometimes block cloud IP ranges or change their
  HTML. A failing source never breaks the run: it is skipped with a warning, and its older strips
  stay in the history.
* foksuk.nl went offline. Fokke & Sukke is therefore read from the
  [official Bluesky account](https://bsky.app/profile/fokkesukke.bsky.social), which posts less often
  than the daily NRC cartoon.
* The retro feed is a Hacker News search through [hnrss.org](https://hnrss.org); tune the query in
  the config.
* Comic images are loaded from their publishers' servers with `referrerpolicy="no-referrer"`. Strips
  whose image disappears are hidden automatically.

All headlines, articles and comics belong to their respective publishers. The layout and features are
modelled on Wiho's personal portal at wihome.net.
