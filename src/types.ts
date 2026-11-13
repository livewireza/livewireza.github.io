export type PageId = 'news' | 'comics' | 'bookmarks';

/** How article summaries are shown: as a yellow tooltip on hover (original) or below each headline. */
export type SummaryMode = 'hover' | 'inline';

export interface NewsItem {
  title: string;
  link: string;
  description?: string;
  comments?: string;
  date?: string;
  firstSeen?: string;
}

export interface FeedState {
  fetchedAt?: string;
  error?: string | null;
  items: NewsItem[];
}

export interface NewsData {
  generatedAt: string;
  seed?: boolean;
  feeds: Record<string, FeedState | undefined>;
}

export interface ComicEntry {
  key: string;
  source: string;
  image: string;
  title?: string;
  alt?: string;
  link?: string;
  fetchedAt: string;
}

export interface ComicSourceStatus {
  checkedAt?: string;
  error?: string | null;
}

export interface ComicsData {
  generatedAt: string;
  seed?: boolean;
  comics: ComicEntry[];
  sources?: Record<string, ComicSourceStatus | undefined>;
}

export interface FeedConfig {
  id: string;
  title: string;
  link: string;
  url: string;
  maxItems?: number;
  showDescription?: boolean;
  titleDomain?: boolean;
  commentsAsDescription?: boolean;
}

export interface ComicSourceConfig {
  id: string;
  title: string;
  link: string;
  type: 'xkcd' | 'rss' | 'gocomics' | 'page' | 'bluesky';
  url?: string;
  slug?: string;
  actor?: string;
  pattern?: string;
  lookbackDays?: number;
}

export interface BookmarkLink {
  title: string;
  url: string;
}

export interface BookmarkGroup {
  id: string;
  title: string;
  links: BookmarkLink[];
}

export interface SiteConfig {
  title: string;
  pages: Record<PageId, string>;
  updateInterval: string;
  news: { defaultLayout: string[][]; feeds: FeedConfig[] };
  comics: { pageSize: number; maxHistory: number; sources: ComicSourceConfig[] };
  bookmarks: { defaultLayout: string[][]; groups: BookmarkGroup[] };
}
