import { config } from '../lib/config';
import type { PageId } from '../types';
import { SettingsIcon } from './Icons';

const TABS: { id: PageId; label: string }[] = [
  { id: 'news', label: 'News' },
  { id: 'comics', label: 'Comics' },
  { id: 'bookmarks', label: 'Bookmarks' },
];

interface HeaderProps {
  page: PageId;
  onOpenPrefs: () => void;
}

export function Header({ page, onOpenPrefs }: HeaderProps) {
  return (
    <div id="header">
      <button id="prefsButton" type="button" title="Preferences" aria-label="Preferences" onClick={onOpenPrefs}>
        <SettingsIcon />
      </button>
      <div id="pageTitle">{config.title}</div>
      <div id="tabs">
        <ul>
          {TABS.map((tab) =>
            tab.id === page ? (
              <li key={tab.id} className="active" aria-current="page">
                {tab.label}
              </li>
            ) : (
              <li key={tab.id}>
                <a href={`#/${tab.id}`}>{tab.label}</a>
              </li>
            ),
          )}
        </ul>
      </div>
    </div>
  );
}
