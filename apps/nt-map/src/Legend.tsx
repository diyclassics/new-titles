import { CATEGORIES, CATEGORY_COLOR, type Category } from './data.ts';

type Props = {
  counts: Record<Category, number>;
  filter: Set<Category>;
  onToggle: (cat: Category) => void;
  onReset: () => void;
  allActive: boolean;
};

export function Legend({ counts, filter, onToggle, onReset, allActive }: Props) {
  return (
    <div className="legend">
      {CATEGORIES.map((cat) => {
        const active = filter.has(cat);
        const color = CATEGORY_COLOR[cat];
        return (
          <button
            key={cat}
            type="button"
            className={`legend-item ${active ? '' : 'muted'}`}
            onClick={() => onToggle(cat)}
            title={
              allActive
                ? `Click to show only "${cat}"`
                : active
                  ? 'Click to hide'
                  : 'Click to also show'
            }
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
      <button
        type="button"
        className="legend-reset"
        onClick={onReset}
        disabled={allActive}
        title="Show all categories"
      >
        Reset
      </button>
    </div>
  );
}
