import { useEffect, useRef } from 'react';
import { CATEGORIES, CATEGORY_COLOR, type Category } from './data.ts';

type Props = {
  open: boolean;
  onClose: () => void;
  counts: Record<Category, number>;
  filter: ReadonlySet<Category>;
  onToggle: (cat: Category) => void;
  onReset: () => void;
  allActive: boolean;
};

export function FilterSheet({
  open,
  onClose,
  counts,
  filter,
  onToggle,
  onReset,
  allActive,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="filter-sheet"
      aria-labelledby="filter-sheet-title"
      onClose={onClose}
    >
      <header className="filter-sheet-header">
        <h2 id="filter-sheet-title">Filters</h2>
        <button
          type="button"
          className="filter-sheet-close"
          onClick={onClose}
          aria-label="Close filters"
        >
          ×
        </button>
      </header>
      <div className="filter-sheet-chips">
        {CATEGORIES.map((cat) => {
          const active = filter.has(cat);
          const color = CATEGORY_COLOR[cat];
          return (
            <button
              key={cat}
              type="button"
              className={`legend-item ${active ? '' : 'muted'}`}
              onClick={() => onToggle(cat)}
            >
              <span
                className="swatch"
                style={{ background: active ? color : 'transparent', borderColor: color }}
              />
              <span className="legend-text">{cat}</span>
              <span className="legend-count">{counts[cat]}</span>
            </button>
          );
        })}
      </div>
      <footer className="filter-sheet-footer">
        <button type="button" className="legend-reset" onClick={onReset} disabled={allActive}>
          Reset
        </button>
      </footer>
    </dialog>
  );
}
