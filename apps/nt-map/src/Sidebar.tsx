import type { Acquisition } from '@nt/data/schema';
import { CATEGORY_COLOR, type Category } from './data.ts';
import type { ResolvedPlace } from './types.ts';

type Props = {
  records: readonly Acquisition[];
  placesById: Record<string, ResolvedPlace>;
  classificationsById: Record<string, Category>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Index in `records` where the unmapped section starts. Equal to records.length if all are mapped. */
  firstUnmappedIndex: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

export function Sidebar({
  records,
  placesById,
  classificationsById,
  selectedId,
  onSelect,
  firstUnmappedIndex,
  searchQuery,
  onSearchChange,
}: Props) {
  const unmappedCount = records.length - firstUnmappedIndex;
  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title, author, call #…"
          aria-label="Search records"
        />
        {searchQuery ? (
          <button
            type="button"
            className="sidebar-search-clear"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            title="Clear search"
          >
            ×
          </button>
        ) : null}
      </div>
      {records.length === 0 ? (
        <div className="sidebar-empty">
          {searchQuery.trim() ? 'No matches' : 'No records to show'}
        </div>
      ) : (
        <ol className="record-list">
          {records.map((r, idx) => {
            const place = placesById[r.id];
            const category = classificationsById[r.id];
            const color = category ? CATEGORY_COLOR[category] : '#999';
            const mapped = Boolean(place);
            const showDivider = idx === firstUnmappedIndex && unmappedCount > 0;
            return (
              <li
                key={r.id}
                className={`record-row ${selectedId === r.id ? 'selected' : ''} ${mapped ? '' : 'unmapped'}`}
                style={{ borderLeftColor: mapped ? color : '#ddd' }}
              >
                {showDivider ? (
                  <div className="record-divider">{unmappedCount} without resolved location</div>
                ) : null}
                <button type="button" className="record-row-button" onClick={() => onSelect(r.id)}>
                  <div className="record-title">{r.title}</div>
                  <div className="record-meta">
                    <span className="callno">{r.call_number}</span>
                    {place ? (
                      <span className="place"> · {place.name}</span>
                    ) : (
                      <span className="place muted"> · no location</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
