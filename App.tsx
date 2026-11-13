import { useEffect, useMemo, useState } from 'react';
import { BookmarksPage } from './components/BookmarksPage';
import { ComicsPage } from './components/ComicsPage';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { NewsPage } from './components/NewsPage';
import { PrefsDialog } from './components/PrefsDialog';
import { BOOKMARK_BOX_IDS, NEWS_BOX_IDS, config } from './lib/config';
import { useLayout } from './lib/layout';
import { useStoredState } from './lib/storage';
import { useLiveData } from './lib/useLiveData';
import type { PageId, SummaryMode } from './types';

const PAGES: PageId[] = ['news', 'comics', 'bookmarks'];

/** Hash routing (#/news, #/comics, #/bookmarks) works on GitHub Pages without server config. */
function readPage(): PageId {
  const hash = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const legacy = new URLSearchParams(window.location.search).get('page'); // old index.php?page=… links
  const candidate = (hash || legacy || 'news') as PageId;
  return PAGES.includes(candidate) ? candidate : 'news';
}

const defaultSummaryMode = (): SummaryMode =>
  window.matchMedia?.('(hover: none)').matches ? 'inline' : 'hover';

export default function App() {
  const [page, setPage] = useState<PageId>(readPage);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const { news, comics } = useLiveData();

  const newsBoard = useLayout('news', config.news.defaultLayout, NEWS_BOX_IDS);
  const bookmarksBoard = useLayout('bookmarks', config.bookmarks.defaultLayout, BOOKMARK_BOX_IDS);
  const [storedSummaryMode, setSummaryMode] = useStoredState<SummaryMode>('news:summaries', defaultSummaryMode);
  const [hiddenComics, setHiddenComics] = useStoredState<string[]>('comics:hidden', []);

  // wihome.net's "mobile mode": add ?m to the address to always show summaries.
  const summaryForced = useMemo(() => /(?:^\?|&)m(?:[=&]|$)/.test(window.location.search), []);
  const summaryMode: SummaryMode = summaryForced ? 'inline' : storedSummaryMode;

  useEffect(() => {
    const onHashChange = () => {
      setPage(readPage());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.title = config.pages[page];
    document.body.dataset.pagename = page;
  }, [page]);

  const footerData = page === 'comics' ? comics : news;

  return (
    <>
      <Header page={page} onOpenPrefs={() => setPrefsOpen(true)} />
      <div id="main" className={page === 'comics' ? 'comics' : undefined}>
        {page === 'news' && (
          <NewsPage news={news} layout={newsBoard.layout} onLayoutChange={newsBoard.setLayout} summaryMode={summaryMode} />
        )}
        {page === 'comics' && <ComicsPage comics={comics} hiddenSources={hiddenComics} />}
        {page === 'bookmarks' && (
          <BookmarksPage layout={bookmarksBoard.layout} onLayoutChange={bookmarksBoard.setLayout} />
        )}
        <Footer generatedAt={footerData.generatedAt} seed={footerData.seed} />
      </div>
      <PrefsDialog
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        page={page}
        news={news}
        comics={comics}
        newsBoard={newsBoard}
        bookmarksBoard={bookmarksBoard}
        summaryMode={summaryMode}
        onSummaryModeChange={setSummaryMode}
        summaryForced={summaryForced}
        hiddenComics={hiddenComics}
        onHiddenComicsChange={setHiddenComics}
      />
    </>
  );
}
