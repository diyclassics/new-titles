# Mobile Map/List Toggle — Design

**Date:** 2026-04-29
**Branch:** `mobile-map-list-toggle`
**App:** `apps/nt-map`

## Problem

The `nt-map` app's current mobile layout (≤768px) stacks the map and the
sidebar list vertically: map at 55vh, list at 45vh. Neither surface gets
enough room to be usable. Users can't comfortably scan markers (the map is
too short to show meaningful geography) or read records (the list shows
~3–4 rows before requiring scroll, and selected rows can't expand
without further crowding the map).

Other map-heavy mobile apps (Expedia, Grubhub, Airbnb) solve this by
making list and map mutually exclusive on small screens, with a clear
toggle between them. We adopt the same pattern.

Desktop (>768px) is working well today — sidebar-left + map-right — and
remains unchanged.

## Decisions

| # | Decision |
|---|---|
| 1 | Mobile only. Above 768px, no behavior changes. |
| 2 | Hard toggle: Map view and List view are mutually exclusive on mobile. |
| 3 | Default mobile view is **Map**. The map is the app's differentiator; the list is a supplementary index. |
| 4 | List rows expand inline (mirroring desktop). Each expanded card includes a **Show on map** button that flips to the Map tab and reveals the pin. |
| 5 | Toggle UI is a **bottom tab bar** with two tabs: `Map` (left) and `List` (right). |
| 6 | Selection is fully synchronized across views. Selecting a marker on Map and switching to List shows the row pre-expanded; selecting a row in List flies the map to its pin. |
| 7 | Legend / category filter strip remains persistent above both tabs. Filters apply to both views simultaneously, so the chips belong to the app, not to either tab. |

## Layout

Mobile chrome stack at ≤768px (top to bottom):

1. **Header** — title, status line, month nav (existing).
2. **Legend strip** — chips and reset (existing, persistent across both tabs).
3. **Active view region** — Map (full-bleed) or List (sticky search + scrollable rows).
4. **Bottom tab bar** — `Map` and `List`, fixed at the bottom of the viewport.

Real estate at 375×667: ~140px chrome (~50 header + ~40 legend + ~50 tab bar), ~525px for the active view. The tab bar uses `env(safe-area-inset-bottom)` for notched devices.

Above 768px, the tab bar is `display: none` and the existing two-pane
layout renders unchanged.

## State model

A single addition to `App.tsx`:

```ts
type MobileTab = 'map' | 'list';
const [mobileTab, setMobileTab] = useState<MobileTab>('map');
```

All other state (selection, filter, search, month) is already shared at
the App level and works as-is.

## Mounting strategy

Both `<Sidebar>` and `<MapView>` stay mounted on mobile. The inactive
view is hidden via `display: none` on a class toggled on `.app-body`.
This:

- Keeps the Leaflet instance alive across tab switches (no expensive
  re-init).
- Preserves scroll position in the list and zoom/pan state on the map
  for free.
- Keeps selection coherent — a marker stays highlighted while the user
  reads the expanded card on the List tab.

The split is pure CSS: no `useMediaQuery` hook, no JS-side viewport
detection. Above 768px every new class is a no-op.

## Cross-view interactions

**Map → List:**
1. User taps a marker. `selectFromMarker(id)` runs (existing).
2. User taps the List tab. The Sidebar becomes visible with the row
   already expanded.
3. A new `useEffect` in `Sidebar.tsx`, keyed on `selectedId`, calls
   `scrollIntoView({ block: 'nearest' })` on the selected row. Uses
   `useEffect` (not `useLayoutEffect`) so the visibility flip applies
   first; otherwise scroll runs against a hidden node.

**List → Map:**
1. User taps a row. `selectFromSidebar(id)` expands the row inline and
   calls `flyTo(place)` in the background (existing).
2. The expanded card renders a **Show on map** button (mobile-only,
   only when the record has a resolved place).
3. Tapping it calls `setMobileTab('map')` and re-triggers `flyTo` plus
   popup-open.

Unmapped records simply omit the button — no disabled state, no
"why is this greyed out?" confusion.

## Components

- **New:** `MobileTabBar` — stateless, takes `tab` and `onChange`.
  Renders into the DOM unconditionally; `display: none` above 768px.
  `role="tablist"` with two `role="tab"` buttons, `aria-selected`
  reflects active tab, arrow-key navigation between tabs.
- **Modified:** `App.tsx` adds `mobileTab` state and the `show-map` /
  `show-list` modifier class on `.app-body`.
- **Modified:** `Sidebar.tsx` adds (a) the auto-scroll-to-selected
  effect, and (b) the **Show on map** button inside the expanded
  details card, mobile-visible only.
- **Unchanged:** `Map.tsx`, `Legend.tsx`, `data.ts`, types, prop
  interfaces.

## CSS sketch

```css
.mobile-tab-bar { display: none; }
.show-on-map-button { display: none; }

@media (max-width: 768px) {
  .mobile-tab-bar {
    display: flex;
    border-top: 1px solid #e5e5e5;
    background: white;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
  .mobile-tab-bar button { flex: 1; padding: 12px 0; }
  .mobile-tab-bar button[aria-selected="true"] { /* accent */ }

  .app-body.show-map .sidebar { display: none; }
  .app-body.show-list .map    { display: none; }

  .map, .sidebar { max-height: none; flex: 1 1 auto; }

  .show-on-map-button { display: inline-block; }
}
```

The current mobile rules — `.app-body { flex-direction: column }`,
`.map { flex: 1 1 55vh }`, `.sidebar { max-height: 45vh }` — are removed.
They describe the broken stacked layout this design replaces.

## Edge cases

- **Resize across 768px:** pure CSS handles the swap; `mobileTab` is
  retained dormantly so rotating back returns the user to their
  previous tab.
- **No selection:** target view appears in default state — Map shows
  all markers, List scrolls to top (or last position).
- **Search keyboard:** the soft keyboard covers the tab bar while
  active; this is expected and requires no special handling.
- **Auto-scroll race:** the visibility flip via `display` happens before
  `useEffect` runs `scrollIntoView`, so the target row is in the layout
  tree when scrolled.

## Accessibility

- Tab bar: `role="tablist"`, `role="tab"` buttons, `aria-selected`,
  arrow-key navigation.
- Hidden view receives `aria-hidden="true"` so screen readers don't
  traverse content the user can't see.
- **Show on map** button is a real `<button>` with descriptive label.

## Testing & rollout

Manual scenarios:
- Tap marker → switch to List → confirm row pre-expanded and scrolled
  into view.
- Expand row → tap **Show on map** → confirm Map tab active, map flown
  to pin, popup open.
- Open soft keyboard during search → confirm sticky search bar remains
  visible above keyboard.
- Filter to zero results in each tab → confirm graceful empty state.
- Resize desktop window across 768px → confirm layout swaps without
  remount.

No automated tests added; this is a layout/interaction change with thin
logic, and the project does not yet have Playwright or RTL set up. The
existing `tsc --noEmit` typecheck covers the new state.

Single PR off `mobile-map-list-toggle`. No feature flag — the change is
gated behind a CSS media query and desktop is unchanged.
