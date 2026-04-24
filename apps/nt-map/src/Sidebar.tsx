import type { Acquisition } from '@nt/data/schema';
import { CATEGORY_COLOR, type Category } from './data.ts';
import { bobcatUrl, cleanAuthor, cleanTitle } from './format.ts';
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
            const expanded = selectedId === r.id;
            return (
              <li
                key={r.id}
                className={`record-row ${expanded ? 'selected' : ''} ${mapped ? '' : 'unmapped'}`}
                style={{ borderLeftColor: mapped ? color : '#ddd' }}
              >
                {showDivider ? (
                  <div className="record-divider">{unmappedCount} without resolved location</div>
                ) : null}
                <button type="button" className="record-row-button" onClick={() => onSelect(r.id)}>
                  <div className="record-title">{cleanTitle(r.title)}</div>
                  <div className="record-meta">
                    <span className="callno">{r.call_number}</span>
                    {place ? (
                      <span className="place"> · {place.name}</span>
                    ) : (
                      <span className="place muted"> · no location</span>
                    )}
                  </div>
                </button>
                {expanded ? (
                  <ExpandedDetails record={r} place={place} category={category} color={color} />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

function ExpandedDetails({
  record,
  place,
  category,
  color,
}: {
  record: Acquisition;
  place: ResolvedPlace | undefined;
  category: Category | undefined;
  color: string;
}) {
  const authors = record.authors.map(cleanAuthor).filter(Boolean);
  const pubBits = [record.publisher, record.pub_date].filter(Boolean);
  return (
    <div className="record-details">
      {authors.length > 0 ? <div>{authors.join(', ')}</div> : null}
      {pubBits.length > 0 ? <div className="muted">{pubBits.join(', ')}</div> : null}
      {place ? (
        <div className="muted">
          📍{' '}
          <a href={place.uri} target="_blank" rel="noreferrer">
            {place.name}
          </a>{' '}
          <span className="source-tag">{place.source === 'pleiades' ? 'Pleiades' : 'TGN'}</span>
        </div>
      ) : null}
      {category ? (
        <div className="muted" style={{ color }}>
          <strong>{category}</strong>
        </div>
      ) : null}
      {record.mms_id ? (
        <div>
          <a href={bobcatUrl(record.mms_id)} target="_blank" rel="noreferrer">
            View in Bobcat →
          </a>
        </div>
      ) : null}
    </div>
  );
}
