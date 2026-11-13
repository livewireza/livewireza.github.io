import rawConfig from '../site.config.json';
import rawNews from '../data/news.json';
import rawComics from '../data/comics.json';
import type { ComicsData, NewsData, SiteConfig } from '../types';

/** Everything below is bundled at build time — the GitHub Action regenerates the JSON before each build. */
export const config = rawConfig as unknown as SiteConfig;
export const bundledNews = rawNews as unknown as NewsData;
export const bundledComics = rawComics as unknown as ComicsData;

export const feedsById = new Map(config.news.feeds.map((feed) => [feed.id, feed]));
export const groupsById = new Map(config.bookmarks.groups.map((group) => [group.id, group]));
export const comicSourcesById = new Map(config.comics.sources.map((source) => [source.id, source]));

export const NEWS_BOX_IDS = config.news.feeds.map((feed) => feed.id);
export const BOOKMARK_BOX_IDS = config.bookmarks.groups.map((group) => group.id);
