import type { Acquisition } from '@nt/data/schema';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilterSheet } from './FilterSheet.tsx';
import { Legend } from './Legend.tsx';
import type { MapHandle } from './Map.tsx';
import { MobileViewToggle } from './MobileViewToggle.tsx';
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

// Lazy-load MapView so the Leaflet + clustering bundle doesn't block first
// paint. Header and sidebar render immediately; the map chunk downloads in
// parallel and fills in once ready.
const MapView = lazy(() => import('./Map.tsx'));

type Filter = Set<Category>;

type MobileTab = 'map' | 'list';

const EMPTY_MONTH: MonthData = {
  key: '2026-03',
  label: '',
  records: [],
  placesById: {},
  classificationsById: {},
};

// requestIdleCallback isn't in Safari yet; polyfill to a short timeout.
const ric: (cb: () => void) => number =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (cb) => window.requestIdleCallback(cb, { timeout: 2000 })
    : (cb) => window.setTimeout(cb, 500);
const cic: (id: number) => void =
  typeof window !== 'undefined' && 'cancelIdleCallback' in window
    ? (id) => window.cancelIdleCallback(id)
    : (id) => window.clearTimeout(id);

export function App() {
  const [monthKey, setMonthKey] = useState<MonthKey>('2026-03');
  const [month, setMonth] = useState<MonthData>(EMPTY_MONTH);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => new Set(CATEGORIES));
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('map');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const mapRef = useRef<MapHandle>(null);

  // Load the selected month's data (cached in loadMonth after first fetch).
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

  // When idle, preload adjacent months so prev/next nav is instant.
  useEffect(() => {
    if (loading) return;
    const idx = MONTH_KEYS.indexOf(monthKey);
    const neighbors = [MONTH_KEYS[idx - 1], MONTH_KEYS[idx + 1]].filter(
      (k): k is MonthKey => k !== undefined,
    );
    const id = ric(() => {
      for (const k of neighbors) {
        // loadMonth returns immediately from cache on second call; first call
        // triggers the background download+parse.
        void loadMonth(k);
      }
    });
    return () => cic(id);
  }, [monthKey, loading]);

  const resetView = useCallback(() => {
    mapRef.current?.reset();
  }, []);

  const selectFromSidebar = useCallback(
    (id: string) => {
      setSelectedId((prev) => {
        if (prev === id) return null; // click-again collapses
        const place = month.placesById[id];
        if (place) mapRef.current?.flyTo(place);
        return id;
      });
    },
    [month.placesById],
  );
  const showOnMap = useCallback(
    (id: string) => {
      setMobileTab('map');
      setSelectedId(id);
      const place = month.placesById[id];
      if (place) {
        mapRef.current?.flyTo(place);
        mapRef.current?.openMarker(id);
      }
    },
    [month.placesById],
  );
  // Stable reference — the marker layer's useEffect depends on this.
  const selectFromMarker = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

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

  function toggleCategory(cat: Category) {
    setFilter((prev) => {
      if (prev.size === CATEGORIES.length) return new Set([cat]);
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
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
        <button
          type="button"
          className="filters-button"
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Open filters"
        >
          Filters
          {filter.size < CATEGORIES.length ? <span> · {filter.size}</span> : null}
        </button>
      </header>

      <Legend
        counts={categoryCounts(month.records, month.classificationsById)}
        filter={filter}
        onToggle={toggleCategory}
        onReset={resetFilter}
        allActive={filter.size === CATEGORIES.length}
      />

      <div className={`app-body ${mobileTab === 'map' ? 'show-map' : 'show-list'}`}>
        <Sidebar
          records={sidebarRecords}
          placesById={month.placesById}
          classificationsById={month.classificationsById}
          selectedId={selectedId}
          onSelect={selectFromSidebar}
          onShowOnMap={showOnMap}
          firstUnmappedIndex={firstUnmappedIndex}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <Suspense fallback={<div className="map map-loading">Loading map…</div>}>
          <MapView
            key={monthKey}
            ref={mapRef}
            records={mappable}
            placesById={month.placesById}
            classificationsById={month.classificationsById}
            onSelect={selectFromMarker}
          />
        </Suspense>
      </div>
      <MobileViewToggle tab={mobileTab} onChange={setMobileTab} />
      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        counts={categoryCounts(month.records, month.classificationsById)}
        filter={filter}
        onToggle={toggleCategory}
        onReset={resetFilter}
        allActive={filter.size === CATEGORIES.length}
      />
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
