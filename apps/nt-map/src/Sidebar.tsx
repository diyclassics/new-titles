import type { Acquisition } from '@nt/data/schema';
import { CATEGORY_COLOR, type Category } from './data.ts';
import type { ResolvedPlace } from './types.ts';

type Props = {
  records: readonly Acquisition[];
  placesById: Record<string, ResolvedPlace>;
  classificationsById: Record<string, Category>;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function Sidebar({ records, placesById, classificationsById, selectedId, onSelect }: Props) {
  return (
    <aside className="sidebar">
      <ol className="record-list">
        {records.map((r) => {
          const place = placesById[r.id];
          const category = classificationsById[r.id];
          const color = category ? CATEGORY_COLOR[category] : '#999';
          return (
            <li
              key={r.id}
              className={`record-row ${selectedId === r.id ? 'selected' : ''}`}
              style={{ borderLeftColor: color }}
            >
              <button type="button" className="record-row-button" onClick={() => onSelect(r.id)}>
                <div className="record-title">{r.title}</div>
                <div className="record-meta">
                  <span className="callno">{r.call_number}</span>
                  {place ? <span className="place"> · {place.name}</span> : null}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
