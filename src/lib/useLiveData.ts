import { useEffect, useRef, useState } from 'react';
import { bundledComics, bundledNews } from './config';
import type { ComicsData, NewsData } from '../types';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The workflow publishes data/news.json and data/comics.json next to index.html.
 * Fetching them lets a tab that stays open pick up the next GitHub Actions run
 * without a reload. Anywhere the files don't exist (local preview) this silently
 * keeps the data that was bundled at build time.
 */
async function fetchJson<T>(path: string): Promise<T | null> {
  if (!/^https?:$/.test(window.location.protocol)) return null;
  try {
    const url = new URL(path, window.location.href);
    url.searchParams.set('t', String(Date.now()));
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const isNewer = (candidate?: string, current?: string) =>
  !!candidate && (!current || Date.parse(candidate) > Date.parse(current));

export function useLiveData() {
  const [news, setNews] = useState<NewsData>(bundledNews);
  const [comics, setComics] = useState<ComicsData>(bundledComics);
  const latest = useRef({ news: bundledNews.generatedAt, comics: bundledComics.generatedAt });

  useEffect(() => {
    let cancelled = false;
    let lastRun = 0;

    const check = async () => {
      if (Date.now() - lastRun < 30_000) return;
      lastRun = Date.now();
      const [freshNews, freshComics] = await Promise.all([
        fetchJson<NewsData>('data/news.json'),
        fetchJson<ComicsData>('data/comics.json'),
      ]);
      if (cancelled) return;
      if (freshNews?.feeds && isNewer(freshNews.generatedAt, latest.current.news)) {
        latest.current.news = freshNews.generatedAt;
        setNews(freshNews);
      }
      if (Array.isArray(freshComics?.comics) && isNewer(freshComics.generatedAt, latest.current.comics)) {
        latest.current.comics = freshComics.generatedAt;
        setComics(freshComics);
      }
    };

    void check();
    const timer = window.setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { news, comics };
}
