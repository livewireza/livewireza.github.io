#!/usr/bin/env node
/**
 * Wiho's Portal — data updater
 * ============================
 * Fetches every news feed and comic source listed in src/site.config.json and writes
 *
 *   src/data/news.json    latest headlines per feed
 *   src/data/comics.json  rolling history of daily comics (newest first)
 *
 * It is designed to run on a schedule inside GitHub Actions
 * (see .github/workflows/portal.yml) but works locally as well:
 *
 *   node scripts/update-data.mjs
 *
 * State between runs (comic history, "first seen" timestamps and the last good copy of
 * a feed that is temporarily down) is read from the previously *deployed* site when
 * PREVIOUS_DATA_URL is set — the workflow points it at <github-pages-url>/data/ — so no
 * commits are needed. Without PREVIOUS_DATA_URL the local files are used instead.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

const ROOT = new URL('../', import.meta.url);
const CONFIG_FILE = new URL('src/site.config.json', ROOT);
const DATA_DIR = new URL('src/data/', ROOT);

const USER_AGENT =
  process.env.PORTAL_USER_AGENT ||
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const TIMEOUT_MS = 20_000;
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const RUN_STARTED = new Date();
const DAY_MS = 86_400_000;

/** Images whose URL matches this are never treated as a comic strip. */
const REJECT_IMAGE = /(badge|logo|avatar|icon|sprite|placeholder|favicon|social|share|default)/i;

const log = (...args) => console.log(...args);
const warn = (message) => console.log(IN_ACTIONS ? `::warning::${message}` : `WARN  ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
  }
}

/** fetch() with a timeout, a browser-like User-Agent and retries for transient errors. */
async function request(url, accept = '*/*', retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'nl,en;q=0.8' },
      });
      if (res.ok) return res;
      lastError = new HttpError(res.status, url);
      // Client errors will not fix themselves by retrying (429 is the exception).
      if (res.status < 500 && res.status !== 429) break;
    } catch (error) {
      lastError = error; // network error / timeout → retry
    }
  }
  throw lastError;
}

const getText = async (url, accept) => (await request(url, accept)).text();
const getJson = async (url) => JSON.parse(await getText(url, 'application/json'));

function describeError(error) {
  if (!error) return 'unknown error';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timed out';
  const cause = error.cause?.code || error.cause?.message;
  return cause ? `${error.message} (${cause})` : error.message || String(error);
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
  euro: '€', pound: '£', deg: '°', times: '×', eacute: 'é', egrave: 'è', euml: 'ë',
  ecirc: 'ê', aacute: 'á', agrave: 'à', auml: 'ä', acirc: 'â', aring: 'å', iacute: 'í',
  iuml: 'ï', icirc: 'î', oacute: 'ó', ograve: 'ò', ouml: 'ö', ocirc: 'ô', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', uuml: 'ü', ucirc: 'û', ccedil: 'ç', ntilde: 'ñ', szlig: 'ß',
  Eacute: 'É', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', Aring: 'Å', Oslash: 'Ø',
};

function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function htmlToText(html) {
  if (!html) return '';
  const withoutTags = String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

/** Titles are plain text, but some feeds double-escape entities or sneak HTML in. */
function cleanTitle(title) {
  const value = String(title ?? '');
  return /<\/?[a-z][^>]*>/i.test(value) ? htmlToText(value) : decodeEntities(value).replace(/\s+/g, ' ').trim();
}

const optional = (value) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text || undefined;
};

function truncate(text, max) {
  if (!max || text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max * 0.8))).trimEnd() + '…';
}

function absolutize(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/** "log.schemescape.com" → "schemescape.com", like the domain shown on Hacker News. */
function displayDomain(link) {
  try {
    const parts = new URL(link).hostname.replace(/^www\./, '').split('.');
    if (parts.length <= 2) return parts.join('.');
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    const keep = tld.length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov', 'edu'].includes(sld) ? 3 : 2;
    return parts.slice(-keep).join('.');
  } catch {
    return '';
  }
}

const stripQuery = (url) => String(url ?? '').split(/[?#]/)[0];

function toIso(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// ---------------------------------------------------------------------------
// HTML scraping helpers
// ---------------------------------------------------------------------------

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[2] ?? match[3] ?? match[4] ?? '') : '';
}

/** og:image / twitter:image from a page. */
function metaImage(html, baseUrl) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop');
    if (!/^(og:image(:url|:secure_url)?|twitter:image(:src)?|image)$/i.test(key)) continue;
    const content = decodeEntities(attr(tag, 'content'));
    if (content && !REJECT_IMAGE.test(content)) return absolutize(content, baseUrl);
  }
  return null;
}

/** First <img> in a chunk of HTML (used for comic RSS feeds such as SMBC). */
function findImg(html, baseUrl) {
  for (const tag of String(html ?? '').match(/<img\b[^>]*>/gi) ?? []) {
    const src = decodeEntities(attr(tag, 'src') || attr(tag, 'data-src'));
    if (!src || REJECT_IMAGE.test(src)) continue;
    return {
      src: absolutize(src, baseUrl),
      title: decodeEntities(attr(tag, 'title')),
      alt: decodeEntities(attr(tag, 'alt')),
    };
  }
  return null;
}

/** First match of a custom regex (capture group 1 if present). */
function matchPattern(html, pattern, baseUrl) {
  for (const match of html.matchAll(new RegExp(pattern, 'gi'))) {
    const url = decodeEntities(match[1] ?? match[0]);
    if (url && !REJECT_IMAGE.test(url)) return absolutize(url, baseUrl);
  }
  return null;
}

/** Expands {yyyy}/{mm}/{dd} placeholders for today and the previous `lookbackDays` days. */
function expandDateUrls(template, lookbackDays = 0) {
  if (!/\{(yyyy|mm|dd)\}/.test(template)) return [template];
  return Array.from({ length: lookbackDays + 1 }, (_, i) => {
    const d = new Date(RUN_STARTED.getTime() - i * DAY_MS);
    return template
      .replace(/\{yyyy\}/g, String(d.getUTCFullYear()))
      .replace(/\{mm\}/g, pad(d.getUTCMonth() + 1))
      .replace(/\{dd\}/g, pad(d.getUTCDate()));
  });
}

// ---------------------------------------------------------------------------
// Feed parsing (RSS 2.0, RSS 1.0/RDF and Atom)
// ---------------------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Feeds such as NOS embed whole articles as escaped HTML, which easily exceeds the
  // parser's default expansion limits (100k chars). Feeds don't define custom entities,
  // so generous limits are safe here.
  processEntities: {
    enabled: true,
    maxTotalExpansions: Infinity,
    maxExpandedLength: 50_000_000,
    maxEntityCount: 10_000,
  },
  htmlEntities: true,
  isArray: (name, _jpath, _isLeafNode, isAttribute) => !isAttribute && ['item', 'entry', 'link'].includes(name),
});

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === 'object') return textOf(value['#text'] ?? '');
  return String(value);
}

function linkOf(value) {
  const links = Array.isArray(value) ? value : value == null ? [] : [value];
  let fallback = '';
  for (const link of links) {
    if (typeof link === 'string' || typeof link === 'number') {
      if (String(link).trim()) return String(link).trim();
      continue;
    }
    if (link && typeof link === 'object') {
      const href = link['@_href'] || link['#text'] || '';
      if (!href) continue;
      if (!link['@_rel'] || link['@_rel'] === 'alternate') return href;
      fallback ||= href;
    }
  }
  return fallback;
}

function parseFeed(xmlText) {
  const doc = xmlParser.parse(xmlText);
  const channel = doc?.rss?.channel ?? doc?.channel;
  const raw = channel?.item ?? doc?.['rdf:RDF']?.item ?? doc?.RDF?.item ?? doc?.feed?.entry ?? [];
  const items = Array.isArray(raw) ? raw : [raw];

  return items
    .map((item) => {
      const html =
        textOf(item['content:encoded']) || textOf(item.description) || textOf(item.summary) || textOf(item.content);
      const guid = textOf(item.guid) || textOf(item.id);
      return {
        title: cleanTitle(textOf(item.title)),
        link: linkOf(item.link) || (/^https?:\/\//.test(guid) ? guid : ''),
        html,
        description: htmlToText(
          textOf(item.description) || textOf(item.summary) || textOf(item.content) || textOf(item['content:encoded']),
        ),
        comments: textOf(item.comments),
        date: toIso(textOf(item.pubDate) || textOf(item['dc:date']) || textOf(item.published) || textOf(item.updated)),
      };
    })
    .filter((item) => item.title && item.link);
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

function buildItems(feed, parsed, previousItems = []) {
  const firstSeen = new Map(previousItems.map((item) => [item.link, item.firstSeen]));
  return parsed.slice(0, feed.maxItems ?? 14).map((entry) => {
    let title = entry.title;
    if (feed.titleDomain) {
      const domain = displayDomain(entry.link);
      if (domain) title += ` (${domain})`;
    }
    const item = { title, link: entry.link };
    if (feed.commentsAsDescription) {
      if (/^https?:\/\//.test(entry.comments)) item.comments = entry.comments;
    } else if (feed.showDescription !== false && entry.description) {
      item.description = truncate(entry.description, feed.maxDescription ?? 1000);
    }
    if (entry.date) item.date = entry.date;
    item.firstSeen = firstSeen.get(entry.link) ?? RUN_STARTED.toISOString();
    return item;
  });
}

async function updateFeed(feed, previous) {
  const prev = previous?.feeds?.[feed.id];
  try {
    const xml = await getText(
      feed.url,
      'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
    );
    const parsed = parseFeed(xml);
    if (!parsed.length) throw new Error('feed contained no items');
    return { ok: true, state: { fetchedAt: new Date().toISOString(), error: null, items: buildItems(feed, parsed, prev?.items) } };
  } catch (error) {
    const message = describeError(error);
    warn(`news feed "${feed.id}" (${feed.url}): ${message}`);
    // Keep the last good copy so a flaky feed never empties its box.
    return { ok: false, state: { fetchedAt: prev?.fetchedAt, error: message, items: prev?.items ?? [] } };
  }
}

// ---------------------------------------------------------------------------
// Comics
// ---------------------------------------------------------------------------

const COMIC_FETCHERS = {
  /** xkcd has a JSON API. */
  async xkcd() {
    const comic = await getJson('https://xkcd.com/info.0.json');
    return {
      image: comic.img,
      title: decodeEntities(comic.safe_title || comic.title || ''),
      alt: decodeEntities(comic.alt || ''),
      link: `https://xkcd.com/${comic.num}/`,
    };
  },

  /** Any RSS/Atom feed whose latest item contains an <img>, e.g. SMBC. */
  async rss(source) {
    const xml = await getText(source.url, 'application/rss+xml, application/xml, text/xml, */*');
    const [item] = parseFeed(xml);
    if (!item) throw new Error('feed contained no items');
    const img = findImg(item.html, source.url);
    if (!img) throw new Error('no image in the latest feed item');
    let alt = img.title;
    if (!alt) {
      const hovertext = htmlToText(item.html).match(/Hovertext:\s*(.+?)(?:\s*Today's News:|$)/i);
      if (hovertext) alt = hovertext[1].trim();
    }
    return { image: img.src, title: item.title, alt, link: item.link };
  },

  /** GoComics strip pages: today's (or a recent) strip via og:image. */
  async gocomics(source) {
    let lastError = new Error('no strip found');
    for (const daysAgo of [0, 1, 2]) {
      const d = new Date(RUN_STARTED.getTime() - daysAgo * DAY_MS);
      const url = `https://www.gocomics.com/${source.slug}/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
      try {
        const html = await getText(url, 'text/html');
        const image =
          metaImage(html, url) || matchPattern(html, 'https://featureassets\\.gocomics\\.com/assets/[0-9a-f]{20,}', url);
        if (image) return { image, link: url };
        lastError = new Error('no strip image on the page');
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  },

  /** Generic web page: custom regex first, then og:image. Supports {yyyy}-{mm}-{dd} URLs. */
  async page(source) {
    let lastError = new Error('no comic image found on the page');
    for (const url of expandDateUrls(source.url, source.lookbackDays ?? 0)) {
      try {
        const html = await getText(url, 'text/html');
        const image = (source.pattern && matchPattern(html, source.pattern, url)) || metaImage(html, url);
        if (image) return { image, link: url };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  },

  /** Latest image post of a Bluesky account (public API, no auth needed). */
  async bluesky(source) {
    const api = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(source.actor)}&limit=20&filter=posts_with_media`;
    const data = await getJson(api);
    for (const entry of data.feed ?? []) {
      if (entry.reason) continue; // skip reposts
      const post = entry.post;
      const images = post?.embed?.images ?? post?.embed?.media?.images;
      if (!images?.length) continue;
      const rkey = String(post.uri).split('/').pop();
      return {
        image: images[0].fullsize,
        alt: images[0].alt || post.record?.text || '',
        title: post.record?.text || '',
        link: `https://bsky.app/profile/${source.actor}/post/${rkey}`,
      };
    }
    throw new Error('no image posts found');
  },
};

async function updateComics(comicsConfig, previous) {
  const history = Array.isArray(previous?.comics) ? [...previous.comics] : [];
  const sources = {};
  const summary = {};
  const checkedAt = new Date().toISOString();

  const results = await Promise.all(
    comicsConfig.sources.map(async (source) => {
      const fetcher = COMIC_FETCHERS[source.type];
      if (!fetcher) return { source, error: `unknown source type "${source.type}"` };
      try {
        const strip = await fetcher(source);
        if (!strip?.image) throw new Error('no image found');
        return { source, strip };
      } catch (error) {
        return { source, error: describeError(error) };
      }
    }),
  );

  results.forEach(({ source, strip, error }, index) => {
    if (error) {
      warn(`comic "${source.id}": ${error}`);
      sources[source.id] = { checkedAt, error };
      summary[source.id] = `⚠️ ${error}`;
      return;
    }
    sources[source.id] = { checkedAt, error: null };
    const known = history.some((c) => c.source === source.id && stripQuery(c.image) === stripQuery(strip.image));
    if (known) {
      summary[source.id] = '✅ unchanged';
      return;
    }
    history.push({
      key: `${source.id}-${Math.floor(RUN_STARTED.getTime() / 1000)}`,
      source: source.id,
      image: strip.image,
      title: optional(strip.title),
      alt: optional(strip.alt),
      link: strip.link || source.link,
      // Earlier sources in the config sort first within the same run.
      fetchedAt: new Date(RUN_STARTED.getTime() - index).toISOString(),
    });
    summary[source.id] = '🆕 new strip';
  });

  history.sort((a, b) => String(b.fetchedAt).localeCompare(String(a.fetchedAt)));
  return { comics: history.slice(0, comicsConfig.maxHistory ?? 150), sources, summary };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

async function loadPrevious(name) {
  const base = process.env.PREVIOUS_DATA_URL;
  if (base) {
    const url = new URL(`${name}.json`, base.endsWith('/') ? base : `${base}/`).href;
    try {
      // Cache-bust: the Pages CDN may otherwise hand out a copy that is a few minutes old.
      const res = await request(`${url}?t=${Date.now()}`, 'application/json', 3);
      const data = JSON.parse(await res.text());
      if (data?.seed) return null;
      log(`Loaded previous ${name}.json from ${url} (generated ${data?.generatedAt ?? 'unknown'})`);
      return data;
    } catch (error) {
      if (error instanceof HttpError && error.status < 500) {
        if (error.status === 404) log(`No previous ${name}.json at ${url} (first deploy?) — starting fresh.`);
        else warn(`Previous ${name}.json at ${url} returned HTTP ${error.status} — starting fresh.`);
        return null;
      }
      if (error instanceof SyntaxError) {
        warn(`Previous ${name}.json at ${url} is not valid JSON — starting fresh.`);
        return null;
      }
      // Network trouble: abort instead of overwriting the history. The next run retries.
      throw new Error(`Could not download previous ${name}.json from ${url}: ${describeError(error)}`);
    }
  }
  try {
    const data = JSON.parse(await readFile(new URL(`${name}.json`, DATA_DIR), 'utf8'));
    return data?.seed ? null : data;
  } catch {
    return null;
  }
}

async function writeJson(name, data) {
  await writeFile(new URL(name, DATA_DIR), `${JSON.stringify(data, null, 2)}\n`);
}

async function writeSummary(config, feeds, comicsResult) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const lines = ["### Wiho's Portal update", '', '| Feed | Status | Items |', '| --- | --- | --- |'];
  for (const feed of config.news.feeds) {
    const state = feeds[feed.id];
    lines.push(`| ${esc(feed.title)} | ${state.error ? `⚠️ ${esc(state.error)}` : '✅'} | ${state.items.length} |`);
  }
  lines.push('', '| Comic | Status |', '| --- | --- |');
  for (const source of config.comics.sources) {
    lines.push(`| ${esc(source.title)} | ${esc(comicsResult.summary[source.id] ?? '—')} |`);
  }
  lines.push('', `Comic history: ${comicsResult.comics.length} strips.`);
  const markdown = `${lines.join('\n')}\n`;
  log(`\n${markdown}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  const [previousNews, previousComics] = await Promise.all([loadPrevious('news'), loadPrevious('comics')]);

  log(`Fetching ${config.news.feeds.length} news feeds…`);
  const feedResults = await Promise.all(config.news.feeds.map((feed) => updateFeed(feed, previousNews)));
  const feeds = Object.fromEntries(config.news.feeds.map((feed, i) => [feed.id, feedResults[i].state]));

  log(`Fetching ${config.comics.sources.length} comic sources…`);
  const comicsResult = await updateComics(config.comics, previousComics);

  const generatedAt = new Date().toISOString();
  await mkdir(DATA_DIR, { recursive: true });
  await writeJson('news.json', { generatedAt, feeds });
  await writeJson('comics.json', { generatedAt, comics: comicsResult.comics, sources: comicsResult.sources });
  await writeSummary(config, feeds, comicsResult);

  const okCount = feedResults.filter((r) => r.ok).length;
  log(`Done: ${okCount}/${feedResults.length} feeds OK, ${comicsResult.comics.length} comics in history.`);
  if (okCount === 0 && feedResults.length > 0) {
    console.error('Every news feed failed — is the network down? Not deploying this run.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
