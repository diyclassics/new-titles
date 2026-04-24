import { CATEGORIES, CATEGORY_COLOR, type Category } from './data.ts';

type Props = {
  counts: Record<Category, number>;
  filter: Set<Category>;
  onToggle: (cat: Category) => void;
};

export function Legend({ counts, filter, onToggle }: Props) {
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
            title={active ? 'Click to hide' : 'Click to show'}
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
  );
}
