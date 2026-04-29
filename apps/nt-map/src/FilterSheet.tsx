import { useEffect } from 'react';
import { CATEGORIES, CATEGORY_COLOR, type Category } from './data.ts';

type Props = {
  open: boolean;
  onClose: () => void;
  counts: Record<Category, number>;
  filter: Set<Category>;
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
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="filter-sheet-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="presentation"
    >
      <div
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
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
          <button
            type="button"
            className="legend-reset"
            onClick={onReset}
            disabled={allActive}
          >
            Reset
          </button>
        </footer>
      </div>
    </div>
  );
}
