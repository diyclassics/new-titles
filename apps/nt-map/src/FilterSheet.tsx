import { useEffect, useRef } from 'react';
import { CATEGORIES, CATEGORY_COLOR, type Category } from './data.ts';

type Props = {
  open: boolean;
  onClose: () => void;
  counts: Record<Category, number>;
  filter: ReadonlySet<Category>;
  onToggle: (cat: Category) => void;
  onReset: () => void;
};

export function FilterSheet({ open, onClose, counts, filter, onToggle, onReset }: Props) {
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
      id="filter-sheet"
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
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset would require resetting its default styles and adding a visually-hidden legend; div+role=group is functionally equivalent for AT. */}
      <div className="filter-sheet-chips" role="group" aria-label="Region filters">
        {CATEGORIES.map((cat) => {
          const active = filter.has(cat);
          const color = CATEGORY_COLOR[cat];
          return (
            <button
              key={cat}
              type="button"
              className={`legend-item ${active ? '' : 'muted'}`}
              onClick={() => onToggle(cat)}
              aria-pressed={active}
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
        <button
          type="button"
          className="legend-reset"
          onClick={onReset}
          title="Reset filters, selection, and map view"
        >
          Reset
        </button>
      </footer>
    </dialog>
  );
}
