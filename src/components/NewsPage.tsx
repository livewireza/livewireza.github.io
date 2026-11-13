import { useEffect, useState } from 'react';
import { feedsById } from '../lib/config';
import type { Layout } from '../lib/layout';
import { readStored, writeStored } from '../lib/storage';
import type { FeedConfig, FeedState, NewsData, SummaryMode } from '../types';
import { ColumnBoard } from './ColumnBoard';

/**
 * Headlines that appeared since the previous visit get a red bullet (`li.new`), like on
 * wihome.net. The links seen per feed are remembered in localStorage.
 */
function useNewItems(news: NewsData): Set<string> {
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const seen = readStored<Record<string, string[]> | null>('news:seen', null);
    const found: string[] = [];
    const nextSeen: Record<string, string[]> = {};
    for (const [feedId, state] of Object.entries(news.feeds)) {
      const links = (state?.items ?? []).map((item) => item.link);
      nextSeen[feedId] = links;
      const before = seen?.[feedId];
      if (!before) continue; // first visit (or newly added feed): nothing is "new" yet
      const known = new Set(before);
      for (const link of links) if (!known.has(link)) found.push(`${feedId} ${link}`);
    }
    writeStored('news:seen', nextSeen);
    if (found.length) setFresh((prev) => new Set([...prev, ...found]));
  }, [news]);

  return fresh;
}

interface NewsBoxProps {
  feed: FeedConfig;
  state: FeedState | undefined;
  fresh: Set<string>;
  inline: boolean;
}

function NewsBox({ feed, state, fresh, inline }: NewsBoxProps) {
  const items = state?.items ?? [];
  return (
    <>
      <div className="title">
        <a href={feed.link} target="_blank" rel="noopener noreferrer" draggable={false}>
          {feed.title}
        </a>
      </div>
      {items.length === 0 ? (
        <p className="box-empty">
          {state?.error
            ? `Feed currently unavailable (${state.error}).`
            : 'No headlines yet — they appear after the next GitHub Actions run.'}
        </p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${index}:${item.link}`} className={fresh.has(`${feed.id} ${item.link}`) ? 'new' : undefined}>
              <a href={item.link} target="_blank" rel="noopener noreferrer" draggable={false}>
                {item.title}
              </a>
              {item.description ? (
                <p className={`newsbox ${inline ? 'newsbox-inline' : 'newsbox-hidden'}`}>{item.description}</p>
              ) : null}
              {item.comments ? (
                <p className={`newsbox ${inline ? 'newsbox-inline' : 'newsbox-hidden newsbox-sticky'}`}>
                  <a href={item.comments} target="_blank" rel="noopener noreferrer" draggable={false}>
                    Comments
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

interface NewsPageProps {
  news: NewsData;
  layout: Layout;
  onLayoutChange: (next: Layout) => void;
  summaryMode: SummaryMode;
}

export function NewsPage({ news, layout, onLayoutChange, summaryMode }: NewsPageProps) {
  const fresh = useNewItems(news);
  return (
    <ColumnBoard
      layout={layout}
      onChange={onLayoutChange}
      renderBox={(id) => {
        const feed = feedsById.get(id);
        return feed ? (
          <NewsBox feed={feed} state={news.feeds[id]} fresh={fresh} inline={summaryMode === 'inline'} />
        ) : null;
      }}
    />
  );
}
