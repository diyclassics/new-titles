# Mobile Map/List Toggle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `apps/nt-map` usable on phones by replacing the broken stacked
mobile layout (≤768px) with a hard toggle between full-bleed Map and
List views, driven by a bottom tab bar. Desktop layout unchanged.

**Architecture:** Pure-CSS responsive split. Both `<MapView>` and
`<Sidebar>` stay mounted on mobile; `display: none` on a class-modified
`.app-body` swaps which is visible. One new component (`MobileTabBar`),
one new piece of state in `App.tsx` (`mobileTab`), and a new
`openMarker(id)` method on `MapHandle` so the new "Show on map" affordance
in expanded list rows can fly to and reveal the corresponding pin.

**Tech Stack:** React 19, react-leaflet 5, Leaflet 1.9 + leaflet.markercluster,
TypeScript, Vite. No tests in this app yet — verification is `pnpm typecheck`
plus manual browser checks via `pnpm dev:map`.

**Source design:** [`docs/plans/2026-04-29-mobile-map-list-toggle-design.md`](./2026-04-29-mobile-map-list-toggle-design.md)

---

## Conventions for this plan

- All file paths are repo-relative from `/Volumes/fiona/work/code/isaw/new-titles/new-titles`.
- Verification = `pnpm typecheck` (workspace-wide, runs `tsc --noEmit` per package) and a manual browser check at `http://localhost:5173` with DevTools mobile emulation set to **iPhone SE (375×667)**.
- Each task ends with a commit. Commit messages use the existing style ("Sidebar: …", "Map: …", "App: …"). No prefix tags like `feat:`.
- "Verify desktop unchanged" means: in DevTools, set viewport to ≥1024px wide, confirm sidebar-left + map-right is identical to the `main` branch behavior.

---

## Task 1: Add `mobileTab` state and body-class plumbing

**Why first:** Lays the foundation (state + class hook) without any visible change. Future tasks plug into this.

**Files:**
- Modify: `apps/nt-map/src/App.tsx:41-219`

**Step 1: Add the state and type near the top of the App component**

In `apps/nt-map/src/App.tsx`, immediately after the existing imports and before the `EMPTY_MONTH` constant, add:

```ts
type MobileTab = 'map' | 'list';
```

Then, inside `export function App() { ... }`, alongside the other `useState` calls (around line 42), add:

```ts
const [mobileTab, setMobileTab] = useState<MobileTab>('map');
```

**Step 2: Apply the modifier class to `.app-body`**

Locate the `<div className="app-body">` (currently line 196) and change it to:

```tsx
<div className={`app-body ${mobileTab === 'map' ? 'show-map' : 'show-list'}`}>
```

**Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors. The new state is used by the className expression.

**Step 4: Verify the dev server still renders correctly**

Run (in a separate terminal): `pnpm dev:map`
Open `http://localhost:5173`. With DevTools open, inspect `<div class="app-body show-map ...">`. Toggle the state value in React DevTools to `'list'` and confirm the class swaps to `show-list`. No visual change yet — the CSS rules haven't been added.

**Step 5: Commit**

```bash
git add apps/nt-map/src/App.tsx
git commit -m "App: add mobileTab state and show-map/show-list body modifier"
```

---

## Task 2: Create the `MobileTabBar` component

**Why now:** The component renders into the DOM but stays invisible (default `display: none`); the next task makes it visible on mobile. Building it independently keeps the scope small.

**Files:**
- Create: `apps/nt-map/src/MobileTabBar.tsx`
- Modify: `apps/nt-map/src/App.tsx` (import + render)

**Step 1: Create the component file**

Create `apps/nt-map/src/MobileTabBar.tsx`:

```tsx
import { useRef } from 'react';

type MobileTab = 'map' | 'list';

type Props = {
  tab: MobileTab;
  onChange: (tab: MobileTab) => void;
};

const TABS: ReadonlyArray<{ key: MobileTab; label: string }> = [
  { key: 'map', label: 'Map' },
  { key: 'list', label: 'List' },
];

export function MobileTabBar({ tab, onChange }: Props) {
  const refs = useRef<Record<MobileTab, HTMLButtonElement | null>>({
    map: null,
    list: null,
  });

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, current: MobileTab) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const idx = TABS.findIndex((t) => t.key === current);
    const nextIdx = e.key === 'ArrowRight' ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length;
    const next = TABS[nextIdx].key;
    onChange(next);
    refs.current[next]?.focus();
    e.preventDefault();
  }

  return (
    <nav className="mobile-tab-bar" role="tablist" aria-label="View toggle">
      {TABS.map(({ key, label }) => {
        const selected = tab === key;
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(e) => onKey(e, key)}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
```

**Step 2: Mount it in App.tsx**

In `apps/nt-map/src/App.tsx`:

a. Add the import alongside the others at the top:

```ts
import { MobileTabBar } from './MobileTabBar.tsx';
```

b. Inside the App component's JSX, immediately after the closing `</div>` of `<div className="app-body ...">` (currently line 217), before the closing `</div>` of `<div className="app">`, add:

```tsx
<MobileTabBar tab={mobileTab} onChange={setMobileTab} />
```

The final structure should look like:

```tsx
<div className={`app-body ${mobileTab === 'map' ? 'show-map' : 'show-list'}`}>
  <Sidebar ... />
  <Suspense ...>
    <MapView ... />
  </Suspense>
</div>
<MobileTabBar tab={mobileTab} onChange={setMobileTab} />
```

**Step 3: Verify typecheck and the DOM**

Run: `pnpm typecheck` — expected: no errors.

In the dev server, inspect the rendered DOM and confirm:
- A `<nav class="mobile-tab-bar" role="tablist">` exists at the bottom of the `.app` container.
- It contains two `<button role="tab">` elements with `aria-selected` set to `true` for "Map", `false` for "List".

It is visually invisible at this point (no CSS display rule yet), which is expected.

**Step 4: Commit**

```bash
git add apps/nt-map/src/MobileTabBar.tsx apps/nt-map/src/App.tsx
git commit -m "MobileTabBar: new component, mounted in App"
```

---

## Task 3: Wire CSS for tab bar + view swap, remove broken stacked rules

**Why now:** With state and component in place, this is the visual flip. After this commit, mobile users see the new layout; desktop is byte-for-byte unchanged.

**Files:**
- Modify: `apps/nt-map/src/index.css`

**Step 1: Add the default (desktop) rules**

In `apps/nt-map/src/index.css`, immediately before the existing `@media (max-width: 768px)` block (line 346), add:

```css
/* Mobile view-toggle controls. Default-hidden on desktop; mobile media
   query below shows them and swaps which child of .app-body is visible. */
.mobile-tab-bar {
  display: none;
}
.show-on-map-button {
  display: none;
}
```

**Step 2: Replace the broken mobile stacking rules**

Inside the `@media (max-width: 768px)` block (lines 346–387), replace these specific rules — `.app-body { flex-direction: column }`, the entire `.map { ... }` block, and the entire `.sidebar { ... }` block — with the new toggle behavior. Keep the header/legend rules at the top of the block as they are.

The full new mobile-block content for these specific rules is:

```css
@media (max-width: 768px) {
  /* (existing header / legend rules stay as-is — do not change them) */

  /* The body is a single full-bleed view. Hide the inactive child. */
  .app-body {
    flex-direction: row; /* override desktop default-equivalent; harmless */
  }
  .app-body.show-map .sidebar { display: none; }
  .app-body.show-list .map    { display: none; }

  /* The remaining child fills the available flex space. */
  .map,
  .sidebar {
    flex: 1 1 auto;
    max-height: none;
    width: 100%;
    max-width: none;
    border-right: 0;
    border-top: 0;
  }

  /* Tab bar — fixed at the bottom of the .app flex column. */
  .mobile-tab-bar {
    display: flex;
    flex: 0 0 auto;
    border-top: 1px solid #e5e5e5;
    background: white;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
  .mobile-tab-bar button {
    flex: 1;
    padding: 12px 0;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 0.95rem;
    color: #666;
    cursor: pointer;
    border-top: 2px solid transparent;
  }
  .mobile-tab-bar button[aria-selected='true'] {
    color: #0066cc;
    border-top-color: #0066cc;
    font-weight: 500;
  }
  .mobile-tab-bar button:focus-visible {
    outline: 2px solid #0066cc;
    outline-offset: -4px;
  }

  /* The "Show on map" button inside expanded list rows is mobile-only. */
  .show-on-map-button {
    display: inline-block;
  }
}
```

The very-narrow `@media (max-width: 420px)` block (lines 389–408) currently overrides `.map` and `.sidebar` flex/height. **Remove the `.map { ... }` and `.sidebar { ... }` rules from inside that block.** The `.legend-item .legend-text { ... }` rule and `.header-main h1 { ... }` rule both stay.

**Step 3: Verify in mobile DevTools (375×667)**

Run `pnpm dev:map` if not already running. Set DevTools to iPhone SE (375×667).

Confirm:
- Initial view: full-bleed map with markers, header above, legend strip below header, tab bar at the very bottom with `Map` highlighted in blue.
- Tap the `List` tab: the map disappears; the sidebar fills the entire content area (search input sticky at top, scrollable list); `List` is now highlighted.
- Tap `Map` again: returns to map.
- Tab bar respects `env(safe-area-inset-bottom)` — try toggling DevTools to iPhone 14 Pro to confirm there's clearance below the tabs.

**Step 4: Verify desktop unchanged (≥1024px)**

Resize DevTools to a desktop viewport (e.g. 1280×800). Confirm:
- Sidebar-left + map-right side-by-side, identical to `main` branch.
- Tab bar is `display: none` (inspect to confirm).
- The body class is still `app-body show-map` (or `show-list`), but the modifier rules don't fire above 768px, so the desktop layout is unaffected.

**Step 5: Verify the resize edge case**

With DevTools, resize the viewport from 1280px down through 768px to 375px and back up. Confirm the layout swaps cleanly each direction with no broken intermediate state.

**Step 6: Commit**

```bash
git add apps/nt-map/src/index.css
git commit -m "CSS: mobile map/list toggle + bottom tab bar; remove stacked layout"
```

---

## Task 4: Auto-scroll the selected list row into view

**Why now:** With the toggle working visually, the next gap is the Map → List flow: tapping a marker, then switching tabs, should land the user with the corresponding row visible. Without this effect, the row exists but may be off-screen.

**Files:**
- Modify: `apps/nt-map/src/Sidebar.tsx`

**Step 1: Add the effect inside the Sidebar component**

In `apps/nt-map/src/Sidebar.tsx`:

a. Update the React import (line 1) — currently the file imports nothing from `'react'`. Add:

```ts
import { useEffect, useRef } from 'react';
```

b. Inside the `Sidebar` function body, before the `return`, add:

```ts
const selectedRowRef = useRef<HTMLLIElement | null>(null);
useEffect(() => {
  if (!selectedId) return;
  selectedRowRef.current?.scrollIntoView({ block: 'nearest' });
}, [selectedId]);
```

c. On the `<li>` element inside the records map (currently around line 65), add a ref that attaches only when this row is the selected one:

```tsx
<li
  key={r.id}
  ref={expanded ? selectedRowRef : undefined}
  className={`record-row ${expanded ? 'selected' : ''} ${mapped ? '' : 'unmapped'}`}
  style={{ borderLeftColor: mapped ? color : '#ddd' }}
>
```

**Step 2: Why `useEffect`, not `useLayoutEffect`**

`scrollIntoView` runs after the DOM is laid out. On mobile, the visibility flip from Map → List happens via a CSS class change on `.app-body`, which is applied synchronously when `mobileTab` changes. By the time React's `useEffect` runs (a microtask later), the sidebar is in the layout tree. `useLayoutEffect` would fire before the browser commits the visibility change in some edge cases, scrolling against a hidden node.

**Step 3: Verify**

Mobile DevTools (375×667):
1. Tap a marker on the map (open a popup).
2. Tap the `List` tab.
3. Confirm: the list opens with the matching row expanded *and* visible (not scrolled off-screen).
4. Tap a record near the bottom of the list to expand it. Tap `Map`, then back to `List`. The row should be visible without manual scroll.

Desktop:
- Confirm typecheck (`pnpm typecheck`).
- Click a marker in the desktop layout. The sidebar row expands and should auto-scroll into view if it was off-screen — a small bonus to desktop UX, no regression.

**Step 4: Commit**

```bash
git add apps/nt-map/src/Sidebar.tsx
git commit -m "Sidebar: auto-scroll selected row into view on selection change"
```

---

## Task 5: Add `openMarker(id)` to `MapHandle`

**Why now:** The "Show on map" button (Task 6) needs to do more than just `flyTo` — it also opens the marker's popup so the user immediately sees what they navigated to. This requires the map to find a marker by record id, expand any cluster containing it, and open its popup.

**Files:**
- Modify: `apps/nt-map/src/Map.tsx`

**Step 1: Lift refs to `MapView` and add the new handle method**

In `apps/nt-map/src/Map.tsx`:

a. Update the `MapHandle` interface (line 20) to add `openMarker`:

```ts
export interface MapHandle {
  flyTo: (place: { lat: number; lon: number }) => void;
  reset: () => void;
  openMarker: (id: string) => void;
}
```

b. Inside the `MapView` component body (currently lines 36–53), introduce two refs and pass them down:

```tsx
export const MapView = forwardRef<MapHandle, Props>(function MapView(
  { records, placesById, classificationsById, onSelect },
  ref,
) {
  const markersByIdRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map">
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <ClusterLayer
        records={records}
        placesById={placesById}
        classificationsById={classificationsById}
        onSelect={onSelect}
        markersByIdRef={markersByIdRef}
        clusterGroupRef={clusterGroupRef}
      />
      <HandleBridge
        handleRef={ref}
        markersByIdRef={markersByIdRef}
        clusterGroupRef={clusterGroupRef}
      />
      <HomeControl />
    </MapContainer>
  );
});
```

This requires also adding `useRef` to the React import on line 3 — the import already includes it (`forwardRef, useEffect, useImperativeHandle, useRef`), so no change needed.

c. Update `HandleBridge` (currently lines 58–70) to accept the refs and expose `openMarker`:

```tsx
function HandleBridge({
  handleRef,
  markersByIdRef,
  clusterGroupRef,
}: {
  handleRef: React.ForwardedRef<MapHandle>;
  markersByIdRef: React.MutableRefObject<Map<string, L.CircleMarker>>;
  clusterGroupRef: React.MutableRefObject<L.MarkerClusterGroup | null>;
}) {
  const map = useMap();
  useImperativeHandle(
    handleRef,
    () => ({
      flyTo: (place) =>
        map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 6), { duration: 0.6 }),
      reset: () => map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true }),
      openMarker: (id) => {
        const marker = markersByIdRef.current.get(id);
        const group = clusterGroupRef.current;
        if (!marker || !group) return;
        // zoomToShowLayer expands any clusters containing the marker, then
        // calls back so we can open the popup once the marker is on-screen.
        group.zoomToShowLayer(marker, () => marker.openPopup());
      },
    }),
    [map, markersByIdRef, clusterGroupRef],
  );
  return null;
}
```

d. Update `ClusterLayer` (currently lines 72–168) to accept the same refs and write into them. Update the props type and signature:

```tsx
function ClusterLayer({
  records,
  placesById,
  classificationsById,
  onSelect,
  markersByIdRef,
  clusterGroupRef,
}: Pick<Props, 'records' | 'placesById' | 'classificationsById' | 'onSelect'> & {
  markersByIdRef: React.MutableRefObject<Map<string, L.CircleMarker>>;
  clusterGroupRef: React.MutableRefObject<L.MarkerClusterGroup | null>;
}) {
  const map = useMap();
  // (delete the existing local clusterGroupRef declaration — we now use the
  //  one passed in from MapView.)
  // ... existing first useEffect, but assign to the prop ref:
```

In the first `useEffect` (currently around line 81), change `clusterGroupRef.current = group;` and the cleanup `clusterGroupRef.current = null;` to write to the **prop** `clusterGroupRef`. This is a no-op change in name — both refs are named `clusterGroupRef` — but make sure you delete the local `useRef` declaration on line 79 so the closure binds to the prop.

In the second `useEffect` (currently lines 121–165), inside the marker-creation loop, after `marker.bindPopup(...)` and `marker.on('popupopen', ...)`, register the marker in the map. The full updated loop body should be:

```tsx
useEffect(() => {
  const group = clusterGroupRef.current;
  if (!group) return;
  group.clearLayers();
  markersByIdRef.current.clear();

  for (const r of records) {
    const place = placesById[r.id];
    if (!place) continue;
    // ... (all existing marker construction and popup binding stays as-is)

    marker.on('popupopen', () => onSelect(r.id));
    group.addLayer(marker);
    markersByIdRef.current.set(r.id, marker);
  }
}, [records, placesById, classificationsById, onSelect, markersByIdRef, clusterGroupRef]);
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: no errors. The new `openMarker` method is type-safe; the prop refs flow through.

**Step 3: Smoke-test the existing map behavior is unchanged**

Refresh the dev server. Confirm:
- Markers appear, cluster, and uncluster as before.
- Clicking a marker opens its popup and highlights the corresponding sidebar row (existing behavior, unaffected).
- Click the home control — map resets. Click a sidebar row — map flies to it.

**Step 4: Commit**

```bash
git add apps/nt-map/src/Map.tsx
git commit -m "Map: expose openMarker(id) on MapHandle for cross-view navigation"
```

---

## Task 6: "Show on map" button in expanded list rows

**Why now:** All the plumbing is in place. This is the user-visible payoff: a button inside the expanded card on mobile that flips to the Map tab and reveals the pin.

**Files:**
- Modify: `apps/nt-map/src/Sidebar.tsx` (add prop, render button)
- Modify: `apps/nt-map/src/App.tsx` (wire handler)
- Modify: `apps/nt-map/src/index.css` (button styling)

**Step 1: Add the prop and render the button in the expanded card**

In `apps/nt-map/src/Sidebar.tsx`:

a. Extend the `Props` type (around line 6):

```ts
type Props = {
  records: readonly Acquisition[];
  placesById: Record<string, ResolvedPlace>;
  classificationsById: Record<string, Category>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  firstUnmappedIndex: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onShowOnMap: (id: string) => void;
};
```

b. Destructure the new prop in the component signature.

c. Pass it through to `ExpandedDetails`. Update the `<ExpandedDetails ... />` call (around line 85) to:

```tsx
<ExpandedDetails
  record={r}
  place={place}
  category={category}
  color={color}
  onShowOnMap={onShowOnMap}
/>
```

d. Update `ExpandedDetails` (currently lines 96–136) to accept and use the new prop:

```tsx
function ExpandedDetails({
  record,
  place,
  category,
  color,
  onShowOnMap,
}: {
  record: Acquisition;
  place: ResolvedPlace | undefined;
  category: Category | undefined;
  color: string;
  onShowOnMap: (id: string) => void;
}) {
  const authors = record.authors.map(cleanAuthor).filter(Boolean);
  const pubBits = [record.publisher, record.pub_date].filter(Boolean);
  return (
    <div className="record-details">
      {/* (existing authors/pub/place/category/bobcat blocks stay unchanged) */}
      {place ? (
        <div>
          <button
            type="button"
            className="show-on-map-button"
            onClick={() => onShowOnMap(record.id)}
          >
            Show on map →
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

The button is rendered only when `place` is truthy (i.e., the record has a resolved location). Unmapped records simply don't show it. The wrapping `<div>` matches the spacing of sibling rows in the details panel.

**Step 2: Wire the handler in App.tsx**

In `apps/nt-map/src/App.tsx`, alongside `selectFromSidebar` (around line 86), add:

```ts
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
```

Then pass it to the Sidebar:

```tsx
<Sidebar
  records={sidebarRecords}
  placesById={month.placesById}
  classificationsById={month.classificationsById}
  selectedId={selectedId}
  onSelect={selectFromSidebar}
  firstUnmappedIndex={firstUnmappedIndex}
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
  onShowOnMap={showOnMap}
/>
```

Note: `setSelectedId(id)` ensures the popup-open handler doesn't *un*-select if the marker was already selected. Calling `flyTo` then `openMarker` in that order is intentional — `flyTo` starts the pan animation; `openMarker` may zoom further to expand a cluster, and Leaflet handles compounded animations cleanly.

**Step 3: Add the button styling**

In `apps/nt-map/src/index.css`, immediately after the existing `.record-details a:hover { ... }` rule (around line 321) and before `.record-details .source-tag` (line 322), add:

```css
.show-on-map-button {
  /* Default visibility set in the mobile-toggle block above (display: none).
     The mobile media query flips it to inline-block. */
  margin-top: 8px;
  padding: 6px 12px;
  background: white;
  border: 1px solid #0066cc;
  border-radius: 4px;
  color: #0066cc;
  font-family: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}
.show-on-map-button:hover {
  background: #e3f2fd;
}
.show-on-map-button:focus-visible {
  outline: 2px solid #0066cc;
  outline-offset: 1px;
}
```

(The `display: none` / `display: inline-block` lifecycle is already established in Task 3 — these rules just add appearance.)

**Step 4: Verify the full round-trip**

Mobile DevTools (375×667):
1. Tap `List` tab.
2. Tap a row that has a resolved location. Confirm it expands inline; confirm the "Show on map →" button appears.
3. Tap the button. Confirm: the Map tab activates, the map flies to the pin, the popup opens.
4. Tap a row without a location ("no location" in meta). Confirm: no "Show on map" button is shown.
5. Tap the `Map` tab → tap a marker → popup opens. Tap the `List` tab → row is expanded and visible. From the expanded row, tap "Show on map" again → returns to map with the popup open. Round-trip complete.

Desktop (≥1024px):
- Confirm: in the desktop layout, the expanded card does **not** show a "Show on map" button (`display: none` rule from default CSS).
- Confirm: typecheck (`pnpm typecheck`) passes.

**Step 5: Commit**

```bash
git add apps/nt-map/src/Sidebar.tsx apps/nt-map/src/App.tsx apps/nt-map/src/index.css
git commit -m "Sidebar: 'Show on map' button in expanded card; wires to map tab"
```

---

## Task 7: Final smoke test, lint, typecheck, and PR-ready commit

**Why now:** Catch any leftover regressions, run the formatter, and leave the branch ready to merge.

**Step 1: Run lint and typecheck**

```bash
pnpm typecheck
pnpm lint
```

Expected: both clean. If lint reports issues, run `pnpm format` and inspect the diff before committing.

**Step 2: Manual end-to-end walkthrough**

In `pnpm dev:map`, with DevTools mobile emulation set to iPhone SE (375×667):

- [ ] App opens on the Map tab. Markers visible, clustering works, legend chips visible above, tab bar at bottom with Map highlighted.
- [ ] Tap a marker → popup opens.
- [ ] Tap List tab → sidebar fills the screen, the matching row is expanded and scrolled into view.
- [ ] Tap "Show on map →" → flips to Map, flies to pin, popup opens.
- [ ] Tap List tab → tap a row near the bottom of the list → expands inline → tap List tab somewhere else (e.g., the Map tab and back) → tap a different row near the top — confirm scroll behaves naturally.
- [ ] Use the search input in List view — soft keyboard simulation in DevTools (or just type into the search). Confirm sticky search bar stays at the top, list filters, no layout breakage.
- [ ] Toggle a legend filter chip while on List view → confirm rows filter out, count updates. Switch to Map → confirm markers also filtered.
- [ ] Toggle to a different month using the header arrows. Confirm both views update; selection clears.
- [ ] Tap a row that has no resolved location ("no location"). Confirm: it expands but shows no "Show on map" button.

In DevTools desktop (≥1024px):

- [ ] Identical to `main` branch: sidebar-left + map-right side-by-side. Tab bar `display: none`. "Show on map" button `display: none` (verify via Inspect on an expanded row).
- [ ] Click marker → sidebar row expands, scrolls into view (Task 4's effect — confirm no regression, this is a small UX bonus).
- [ ] Click sidebar row → map flies to pin (existing behavior).

Resize:

- [ ] Drag DevTools viewport from 1280px down through 768px to 375px and back up. Confirm the layout transitions cleanly each direction. No flash of stacked layout.

**Step 3: Verify no test regression**

Run: `pnpm test`
Expected: each package's "no tests yet" passthrough exits 0. (The `nt-map` package itself has no tests.)

**Step 4: Final commit if anything was changed by lint/format**

If `pnpm format` produced any changes:

```bash
git add -u
git commit -m "Format: biome auto-format pass"
```

Otherwise skip this step.

**Step 5: Confirm clean working tree and review the branch**

```bash
git status
git log --oneline main..HEAD
```

Expected: clean tree; commits from this plan in order.

**Step 6: Hand off to the user**

Stop here. The user will decide whether to merge to `main`, push, open a PR, or iterate further. Do not push or merge unprompted.

---

## Files touched (summary)

- `apps/nt-map/src/App.tsx` — `mobileTab` state, body class, `MobileTabBar` mount, `showOnMap` handler.
- `apps/nt-map/src/MobileTabBar.tsx` — **new**.
- `apps/nt-map/src/Sidebar.tsx` — auto-scroll effect, "Show on map" button, new prop.
- `apps/nt-map/src/Map.tsx` — `openMarker` on `MapHandle`, lifted refs.
- `apps/nt-map/src/index.css` — tab bar styles, view-swap rules, "Show on map" styles, removal of broken stacked mobile rules.

No new dependencies. No changes to `data.ts`, `types.ts`, `format.ts`, `Legend.tsx`, or any package outside `apps/nt-map`.
