import type { Acquisition } from '@nt/data/schema';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Legend } from './Legend.tsx';
import { MapView } from './Map.tsx';
import { Sidebar } from './Sidebar.tsx';
import {
  CATEGORIES,
  type Category,
  MONTH_KEYS,
  MONTH_LABEL,
  type MonthData,
  type MonthKey,
  loadMonth,
} from './data.ts';

type Filter = Set<Category>;

const EMPTY_MONTH: MonthData = {
  key: '2026-03',
  label: '',
  records: [],
  placesById: {},
  classificationsById: {},
};

export function App() {
  const [monthKey, setMonthKey] = useState<MonthKey>('2026-03');
  const [month, setMonth] = useState<MonthData>(EMPTY_MONTH);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => new Set(CATEGORIES));
  const [searchQuery, setSearchQuery] = useState('');
  // Incremented when a sidebar click wants the map to fly; marker clicks
  // update selection via Leaflet's popupopen without bumping this, so the
  // popup opens without being interrupted by an automatic fly.
  const [flySignal, setFlySignal] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const lastSelectionSource = useRef<'sidebar' | 'marker' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadMonth(monthKey).then((m) => {
      if (!cancelled) {
        setMonth(m);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  function resetView() {
    setResetSignal((v) => v + 1);
  }

  function selectFromSidebar(id: string) {
    lastSelectionSource.current = 'sidebar';
    setSelectedId(id);
    setFlySignal((v) => v + 1);
  }
  function selectFromMarker(id: string) {
    lastSelectionSource.current = 'marker';
    setSelectedId(id);
  }

  const visibleByCategory = useMemo(() => {
    return month.records.filter((r) => {
      const cat = month.classificationsById[r.id];
      return cat ? filter.has(cat) : true;
    });
  }, [month, filter]);

  // For the map: only records with a resolved place.
  const mappable = useMemo(
    () => visibleByCategory.filter((r) => month.placesById[r.id]).sort(byCallNumber),
    [visibleByCategory, month.placesById],
  );

  // For the sidebar: mappable first (by call number), then unmapped (also by call number).
  const sidebarBase = useMemo(() => {
    const unmapped = visibleByCategory.filter((r) => !month.placesById[r.id]).sort(byCallNumber);
    return { mapped: mappable, unmapped };
  }, [visibleByCategory, mappable, month.placesById]);

  const { sidebarRecords, firstUnmappedIndex } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const match = (r: Acquisition) =>
      !q ||
      r.title.toLowerCase().includes(q) ||
      (r.call_number ?? '').toLowerCase().includes(q) ||
      r.authors.some((a) => a.toLowerCase().includes(q));
    const mapped = sidebarBase.mapped.filter(match);
    const unmapped = sidebarBase.unmapped.filter(match);
    return {
      sidebarRecords: [...mapped, ...unmapped],
      firstUnmappedIndex: mapped.length,
    };
  }, [sidebarBase, searchQuery]);

  const selectedRecord = selectedId
    ? (month.records.find((r) => r.id === selectedId) ?? null)
    : null;
  const selectedPlace = selectedId ? (month.placesById[selectedId] ?? null) : null;

  function toggleCategory(cat: Category) {
    setFilter((prev) => {
      // Click from "all active" → collapse to just the clicked category.
      // (Clicking one from the default state should isolate it, not remove it.)
      if (prev.size === CATEGORIES.length) {
        return new Set([cat]);
      }
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      // Never go empty — use the Reset button to restore all.
      if (next.size === 0) return prev;
      return next;
    });
  }

  function resetFilter() {
    setFilter(new Set(CATEGORIES));
  }

  const resolvedTotal = month.records.filter((r) => month.placesById[r.id]).length;
  const unmappedCount = sidebarBase.unmapped.length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-main">
          <h1>
            <button
              type="button"
              className="clickable-title"
              onClick={resetView}
              title="Reset map view"
            >
              ISAW Library New Titles
            </button>
          </h1>
          <p className="subtle">
            {loading ? (
              <span>Loading {MONTH_LABEL[monthKey]}…</span>
            ) : (
              <>
                {mappable.length} mapped (of {resolvedTotal}) · {unmappedCount} unmapped in sidebar
                · {month.records.length} total
              </>
            )}
          </p>
        </div>
        <MonthNav
          monthKey={monthKey}
          onChange={(k) => {
            setMonthKey(k);
            setSelectedId(null);
            setSearchQuery('');
          }}
        />
      </header>

      <Legend
        counts={categoryCounts(month.records, month.classificationsById)}
        filter={filter}
        onToggle={toggleCategory}
        onReset={resetFilter}
        allActive={filter.size === CATEGORIES.length}
      />

      <div className="app-body">
        <Sidebar
          records={sidebarRecords}
          placesById={month.placesById}
          classificationsById={month.classificationsById}
          selectedId={selectedId}
          onSelect={selectFromSidebar}
          firstUnmappedIndex={firstUnmappedIndex}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <MapView
          key={monthKey}
          records={mappable}
          placesById={month.placesById}
          classificationsById={month.classificationsById}
          selectedRecord={selectedRecord}
          selectedPlace={selectedPlace}
          flySignal={flySignal}
          resetSignal={resetSignal}
          onSelect={selectFromMarker}
        />
      </div>
    </div>
  );
}

function byCallNumber(a: Acquisition, b: Acquisition): number {
  return (a.call_number ?? '').localeCompare(b.call_number ?? '');
}

function categoryCounts(
  records: readonly Acquisition[],
  classificationsById: Record<string, Category>,
): Record<Category, number> {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const r of records) {
    const cat = classificationsById[r.id];
    if (cat && cat in counts) counts[cat] += 1;
  }
  return counts;
}

function MonthNav({
  monthKey,
  onChange,
}: {
  monthKey: MonthKey;
  onChange: (k: MonthKey) => void;
}) {
  const idx = MONTH_KEYS.indexOf(monthKey);
  const atFirst = idx <= 0;
  const atLast = idx >= MONTH_KEYS.length - 1;
  function go(delta: number) {
    const next = MONTH_KEYS[idx + delta];
    if (next) onChange(next);
  }
  return (
    <div className="month-nav">
      <button
        type="button"
        className="month-nav-arrow"
        onClick={() => go(-1)}
        disabled={atFirst}
        aria-label="Previous month"
        title={
          atFirst
            ? 'No earlier month available'
            : `Go to ${MONTH_LABEL[MONTH_KEYS[idx - 1] as MonthKey]}`
        }
      >
        ‹
      </button>
      <span className="month-nav-label">{MONTH_LABEL[monthKey]}</span>
      <button
        type="button"
        className="month-nav-arrow"
        onClick={() => go(1)}
        disabled={atLast}
        aria-label="Next month"
        title={
          atLast
            ? 'No later month available'
            : `Go to ${MONTH_LABEL[MONTH_KEYS[idx + 1] as MonthKey]}`
        }
      >
        ›
      </button>
    </div>
  );
}
