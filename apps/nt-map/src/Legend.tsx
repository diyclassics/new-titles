import { CATEGORIES, CATEGORY_COLOR, type Category } from './data.ts';

type Props = {
  counts: Record<Category, number>;
  filter: ReadonlySet<Category>;
  onToggle: (cat: Category) => void;
  onReset: () => void;
  allActive: boolean;
};

export function Legend({ counts, filter, onToggle, onReset, allActive }: Props) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset would require resetting its default styles and adding a visually-hidden legend; div+role=group is functionally equivalent for AT.
    <div className="legend" role="group" aria-label="Region filters">
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
