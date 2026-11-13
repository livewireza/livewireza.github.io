import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { Layout } from '../lib/layout';
import { CloseIcon } from './Icons';

interface ColumnBoardProps {
  layout: Layout;
  onChange: (next: Layout) => void;
  /** Inner content (title + list) of a box. */
  renderBox: (id: string) => ReactNode;
}

interface DropTarget {
  column: number;
  index: number;
}

/**
 * The column table from wihome.net: boxes can be dragged between columns (a red line
 * shows where they will land) and closed with the button that appears on hover.
 */
export function ColumnBoard({ layout, onChange, renderBox }: ColumnBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const columnRefs = useRef<Array<HTMLTableCellElement | null>>([]);

  const width = layout.length === 1 ? 'auto' : `${100 / layout.length}%`;

  /** Index (among the non-dragged boxes) before which a drop at `clientY` lands. */
  const indexAt = (column: number, clientY: number) => {
    const cell = columnRefs.current[column];
    const boxes = Array.from(cell?.querySelectorAll<HTMLElement>(':scope > .box') ?? []).filter(
      (box) => box.dataset.id !== dragId,
    );
    const next = boxes.findIndex((box) => {
      const rect = box.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return next === -1 ? boxes.length : next;
  };

  const startDrag = (event: DragEvent<HTMLDivElement>, id: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id); // Firefox needs data to start a drag
    setDragId(id);
    // Hide the original only after the browser has taken its drag snapshot.
    window.setTimeout(() => setHiddenId(id), 0);
  };

  const endDrag = () => {
    setDragId(null);
    setHiddenId(null);
    setTarget(null);
  };

  const dragOver = (event: DragEvent<HTMLTableCellElement>, column: number) => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const index = indexAt(column, event.clientY);
    setTarget((prev) => (prev && prev.column === column && prev.index === index ? prev : { column, index }));
  };

  const drop = (event: DragEvent<HTMLTableCellElement>, column: number) => {
    if (!dragId) return;
    event.preventDefault();
    const index = indexAt(column, event.clientY);
    const next = layout.map((ids) => ids.filter((id) => id !== dragId));
    next[column].splice(index, 0, dragId);
    onChange(next);
    endDrag();
  };

  const close = (id: string) => onChange(layout.map((ids) => ids.filter((boxId) => boxId !== id)));

  return (
    <table className={`columns col${layout.length}`}>
      <tbody>
        <tr>
          {layout.map((ids, column) => {
            const children: ReactNode[] = [];
            const indicator = <div key="__drop-indicator" className="drop-indicator" />;
            let position = 0;
            for (const id of ids) {
              const isDragged = id === dragId;
              if (!isDragged && target?.column === column && target.index === position) children.push(indicator);
              children.push(
                <div
                  key={id}
                  id={id}
                  data-id={id}
                  className="box draggable"
                  draggable
                  onDragStart={(event) => startDrag(event, id)}
                  onDragEnd={endDrag}
                  style={hiddenId === id ? { display: 'none' } : undefined}
                >
                  <button type="button" className="closebutton" title="Close" aria-label="Close box" onClick={() => close(id)}>
                    <CloseIcon />
                  </button>
                  {renderBox(id)}
                </div>,
              );
              if (!isDragged) position++;
            }
            if (target?.column === column && target.index === position) children.push(indicator);

            return (
              <td
                key={column}
                className="column"
                style={{ width }}
                ref={(element) => {
                  columnRefs.current[column] = element;
                }}
                onDragOver={(event) => dragOver(event, column)}
                onDrop={(event) => drop(event, column)}
              >
                {children}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
