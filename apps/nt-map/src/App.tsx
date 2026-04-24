import type { Acquisition } from '@nt/data/schema';
import { useMemo, useState } from 'react';
import { Legend } from './Legend.tsx';
import { MapView } from './Map.tsx';
import { Sidebar } from './Sidebar.tsx';
import { CATEGORIES, type Category, MONTH_KEYS, type MonthKey, loadMonth } from './data.ts';

type Filter = Set<Category>;

export function App() {
  const [monthKey, setMonthKey] = useState<MonthKey>('2026-03');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => new Set(CATEGORIES));

  const month = useMemo(() => loadMonth(monthKey), [monthKey]);

  const mappable = useMemo(() => {
    return month.records
      .filter((r) => month.placesById[r.id])
      .filter((r) => {
        const cat = month.classificationsById[r.id];
        return cat ? filter.has(cat) : true;
      })
      .sort(byCallNumber);
  }, [month, filter]);

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-main">
          <h1>ISAW Library New Titles</h1>
          <p className="subtle">
            {mappable.length} of {resolvedTotal} mapped records ({month.records.length} total)
          </p>
        </div>
        <div className="month-picker">
          {MONTH_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`month-btn ${k === monthKey ? 'active' : ''}`}
              onClick={() => {
                setMonthKey(k);
                setSelectedId(null);
              }}
            >
              {k}
            </button>
          ))}
        </div>
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
          records={mappable}
          placesById={month.placesById}
          classificationsById={month.classificationsById}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <MapView
          key={monthKey}
          records={mappable}
          placesById={month.placesById}
          classificationsById={month.classificationsById}
          selectedRecord={selectedRecord}
          selectedPlace={selectedPlace}
          onSelect={setSelectedId}
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
