import { useEffect, useRef, useState } from 'react';
import { BOOKMARK_BOX_IDS, NEWS_BOX_IDS, config, feedsById, groupsById } from '../lib/config';
import { formatDateTime, timeAgo, useNow } from '../lib/format';
import { hiddenBoxes, reflow, type Layout } from '../lib/layout';
import type { ComicsData, NewsData, PageId, SummaryMode } from '../types';

interface BoardControls {
  layout: Layout;
  setLayout: (next: Layout) => void;
  resetLayout: () => void;
}

interface PrefsDialogProps {
  open: boolean;
  onClose: () => void;
  page: PageId;
  news: NewsData;
  comics: ComicsData;
  newsBoard: BoardControls;
  bookmarksBoard: BoardControls;
  summaryMode: SummaryMode;
  onSummaryModeChange: (mode: SummaryMode) => void;
  summaryForced: boolean;
  hiddenComics: string[];
  onHiddenComicsChange: (ids: string[]) => void;
}

function ColumnPrefs({ board, knownIds, titleOf }: { board: BoardControls; knownIds: string[]; titleOf: (id: string) => string }) {
  const [selected, setSelected] = useState('');
  const hidden = hiddenBoxes(board.layout, knownIds);

  const addBox = () => {
    if (!selected) return;
    // Like the original, a re-added box lands at the top of the first column.
    const next = board.layout.map((ids) => [...ids]);
    next[0].unshift(selected);
    board.setLayout(next);
    setSelected('');
  };

  return (
    <>
      <fieldset>
        <legend>Number of columns</legend>
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={n === board.layout.length ? 'activeColumnButton' : undefined}
              aria-pressed={n === board.layout.length}
              onClick={() => board.setLayout(reflow(board.layout, n))}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Add a box</legend>
        {hidden.length === 0 ? (
          <span className="muted">All boxes are already on the page. Close one with the red ✕ that appears on hover.</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              <option value="">— choose a box —</option>
              {hidden.map((id) => (
                <option key={id} value={id}>
                  {titleOf(id)}
                </option>
              ))}
            </select>
            <button type="button" disabled={!selected} onClick={addBox}>
              Add
            </button>
          </div>
        )}
      </fieldset>
    </>
  );
}

export function PrefsDialog(props: PrefsDialogProps) {
  const { open, onClose, page, news, comics } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const now = useNow(30_000);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const resetPage = () => {
    if (page === 'news') props.newsBoard.resetLayout();
    if (page === 'bookmarks') props.bookmarksBoard.resetLayout();
    if (page === 'comics') props.onHiddenComicsChange([]);
  };

  const generatedAt = page === 'comics' ? comics.generatedAt : news.generatedAt;
  const isSeed = page === 'comics' ? comics.seed : news.seed;
  const feedErrors = config.news.feeds.filter((feed) => news.feeds[feed.id]?.error);
  const comicErrors = config.comics.sources.filter((source) => comics.sources?.[source.id]?.error);

  return (
    <dialog
      ref={dialogRef}
      id="prefs"
      aria-label="Preferences"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose(); // click on the backdrop
      }}
    >
      <div className="prefs-inner">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2>Preferences — {config.pages[page]}</h2>
          <button type="button" onClick={onClose} aria-label="Close preferences">
            ✕
          </button>
        </div>

        {page === 'news' && (
          <>
            <ColumnPrefs board={props.newsBoard} knownIds={NEWS_BOX_IDS} titleOf={(id) => feedsById.get(id)?.title ?? id} />
            <fieldset>
              <legend>Article summaries</legend>
              {props.summaryForced ? (
                <span className="muted">Shown below the headlines because the address contains ?m (mobile mode).</span>
              ) : (
                <div className="flex flex-col gap-1">
                  <label>
                    <input
                      type="radio"
                      name="summaries"
                      checked={props.summaryMode === 'hover'}
                      onChange={() => props.onSummaryModeChange('hover')}
                    />{' '}
                    Yellow pop-up when hovering a headline
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="summaries"
                      checked={props.summaryMode === 'inline'}
                      onChange={() => props.onSummaryModeChange('inline')}
                    />{' '}
                    Always show below the headline
                  </label>
                </div>
              )}
            </fieldset>
          </>
        )}

        {page === 'bookmarks' && (
          <ColumnPrefs
            board={props.bookmarksBoard}
            knownIds={BOOKMARK_BOX_IDS}
            titleOf={(id) => groupsById.get(id)?.title ?? id}
          />
        )}

        {page === 'comics' && (
          <fieldset>
            <legend>Show these comics</legend>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {config.comics.sources.map((source) => {
                const visible = !props.hiddenComics.includes(source.id);
                return (
                  <label key={source.id}>
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() =>
                        props.onHiddenComicsChange(
                          visible ? [...props.hiddenComics, source.id] : props.hiddenComics.filter((id) => id !== source.id),
                        )
                      }
                    />{' '}
                    {source.title}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend>Data</legend>
          <div>
            {isSeed ? 'Bundled snapshot from ' : 'Last update: '}
            <b>{formatDateTime(generatedAt)}</b>
            {!isSeed && <> ({timeAgo(generatedAt, now)})</>}
          </div>
          <div className="muted mt-1">
            A GitHub Actions workflow fetches all feeds and comics {config.updateInterval}, rebuilds this page and
            publishes it to GitHub Pages. Open tabs pick up new data automatically.
          </div>
          {page !== 'comics' && feedErrors.length > 0 && (
            <ul className="status-list">
              {feedErrors.map((feed) => (
                <li key={feed.id} className="err">
                  {feed.title}: {news.feeds[feed.id]?.error}
                </li>
              ))}
            </ul>
          )}
          {page === 'comics' && comicErrors.length > 0 && (
            <ul className="status-list">
              {comicErrors.map((source) => (
                <li key={source.id} className="err">
                  {source.title}: {comics.sources?.[source.id]?.error}
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" onClick={resetPage}>
            Reset to defaults
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
