import { useCallback, useState } from 'react';
import { readStored, removeStored, writeStored } from './storage';

/** A layout is a list of columns, each column a list of box ids (top to bottom). */
export type Layout = string[][];

export const MAX_COLUMNS = 5;

export function sanitizeLayout(raw: unknown, knownIds: readonly string[]): Layout | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_COLUMNS) return null;
  const known = new Set(knownIds);
  const used = new Set<string>();
  const result: Layout = [];
  for (const column of raw) {
    if (!Array.isArray(column)) return null;
    const ids: string[] = [];
    for (const id of column) {
      if (typeof id === 'string' && known.has(id) && !used.has(id)) {
        used.add(id);
        ids.push(id);
      }
    }
    result.push(ids);
  }
  return result;
}

/** Re-distributes all boxes over `columns` columns, keeping their reading order. */
export function reflow(layout: Layout, columns: number): Layout {
  const count = Math.min(MAX_COLUMNS, Math.max(1, Math.round(columns)));
  const all = layout.flat();
  const result: Layout = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const size = Math.floor(all.length / count) + (i < all.length % count ? 1 : 0);
    result.push(all.slice(offset, offset + size));
    offset += size;
  }
  return result;
}

export function hiddenBoxes(layout: Layout, knownIds: readonly string[]): string[] {
  const visible = new Set(layout.flat());
  return knownIds.filter((id) => !visible.has(id));
}

function initialLayout(defaultLayout: Layout, knownIds: readonly string[]): Layout {
  const base = sanitizeLayout(defaultLayout, knownIds) ?? [[...knownIds]];
  // Phones get a single column on their first visit; they can change it in the preferences.
  if (typeof window !== 'undefined' && window.innerWidth < 700 && base.length > 1) return reflow(base, 1);
  return base;
}

export function useLayout(page: string, defaultLayout: Layout, knownIds: readonly string[]) {
  const key = `${page}:layout`;
  const [layout, setLayoutState] = useState<Layout>(
    () => sanitizeLayout(readStored<unknown>(key, null), knownIds) ?? initialLayout(defaultLayout, knownIds),
  );

  const setLayout = useCallback(
    (next: Layout) => {
      setLayoutState(next);
      writeStored(key, next);
    },
    [key],
  );

  const resetLayout = useCallback(() => {
    removeStored(key);
    setLayoutState(initialLayout(defaultLayout, knownIds));
  }, [key, defaultLayout, knownIds]);

  return { layout, setLayout, resetLayout };
}
