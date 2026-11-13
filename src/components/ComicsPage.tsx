import { useEffect, useMemo, useRef, useState } from 'react';
import { comicSourcesById, config } from '../lib/config';
import type { ComicsData } from '../types';

interface ComicsPageProps {
  comics: ComicsData;
  hiddenSources: string[];
}

/** Stream of the latest strips, newest first, with infinite scrolling like wihome.net/comics. */
export function ComicsPage({ comics, hiddenSources }: ComicsPageProps) {
  const pageSize = config.comics.pageSize || 10;
  const [count, setCount] = useState(pageSize);
  const [loading, setLoading] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const loadTimer = useRef<number | undefined>(undefined);

  const list = useMemo(() => {
    const hidden = new Set(hiddenSources);
    return [...comics.comics]
      .filter((c) => comicSourcesById.has(c.source) && !hidden.has(c.source) && !broken.has(c.key))
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  }, [comics, hiddenSources, broken]);

  const hasMore = count < list.length;

  useEffect(() => {
    if (!hasMore) return;
    const onScroll = () => {
      const doc = document.documentElement;
      const distanceToBottom = doc.scrollHeight - doc.clientHeight - doc.scrollTop;
      if (distanceToBottom > 400 || loadTimer.current !== undefined) return;
      setLoading(true);
      loadTimer.current = window.setTimeout(() => {
        setCount((c) => c + pageSize);
        setLoading(false);
        loadTimer.current = undefined;
      }, 250);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [hasMore, pageSize, count]);

  useEffect(() => () => window.clearTimeout(loadTimer.current), []);

  if (list.length === 0) {
    return <p className="comics-end">No comics yet — they appear after the next GitHub Actions run.</p>;
  }

  return (
    <>
      {list.slice(0, count).map((comic) => {
        const source = comicSourcesById.get(comic.source)!;
        return (
          <div key={comic.key} className="box" id={comic.source}>
            <div className="title">
              <a href={comic.link || source.link} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
            </div>
            <img
              className="comic"
              src={comic.image}
              title={comic.alt || comic.title || ''}
              alt={comic.title ? `${source.title}: ${comic.title}` : `${source.title} comic`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={(event) => event.currentTarget.classList.add('loaded')}
              onError={() => setBroken((prev) => new Set(prev).add(comic.key))}
            />
          </div>
        );
      })}
      {!hasMore && (
        <p className="comics-end">
          That's all — {list.length} strips in the archive. New ones are collected {config.updateInterval}.
        </p>
      )}
      {loading && <div id="loadingPlaceholder">Loading more...</div>}
    </>
  );
}
