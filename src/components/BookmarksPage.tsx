import { groupsById } from '../lib/config';
import type { Layout } from '../lib/layout';
import { ColumnBoard } from './ColumnBoard';

interface BookmarksPageProps {
  layout: Layout;
  onLayoutChange: (next: Layout) => void;
}

export function BookmarksPage({ layout, onLayoutChange }: BookmarksPageProps) {
  return (
    <ColumnBoard
      layout={layout}
      onChange={onLayoutChange}
      renderBox={(id) => {
        const group = groupsById.get(id);
        if (!group) return null;
        return (
          <>
            <div className="title">{group.title}</div>
            <ul>
              {group.links.map((link) => (
                <li key={`${link.title}|${link.url}`}>
                  <a href={link.url} draggable={false}>
                    {link.title}
                  </a>
                </li>
              ))}
            </ul>
          </>
        );
      }}
    />
  );
}
