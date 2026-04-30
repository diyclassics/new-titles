# Accessibility audit — nt-map

**Baseline:** WCAG 2.1 Level AA + general best practices. Institutional-specific guidelines (NYU/ISAW) to be layered in once supplied.

**Scope:** `apps/nt-map` only at this stage. The website fragment and post-launch packages are out of scope until they exist.

**Method:** Source review of components, CSS, and markup against the WCAG 2.1 success criteria and common ARIA patterns. No automated scanner output yet — that's a follow-up step (axe-core, Lighthouse, or pa11y-ci in CI).

## Findings by priority

### Tier 1 — Blockers (fix before launch)

**1. Reduced-motion preference is not respected** — WCAG 2.3.3 (AAA, but standard practice).
The map heavily uses animated transitions: `flyTo`, `fitBounds`, `setView` all pass `animate: true`. The mobile pill has a `:active` scale transform. Users with vestibular disorders or who set `prefers-reduced-motion: reduce` get unwanted motion.
*Files:* `Map.tsx` (4 call sites), `index.css` (`.mobile-view-toggle:active`).
*Fix:* Wrap animation triggers in a `prefers-reduced-motion` check; disable the scale transform under the same media query.

**2. Touch targets too small on mobile** — WCAG 2.5.5 (AAA), but a real usability blocker on phones.
Several controls fall below the recommended 44×44 CSS px minimum:
- `.sidebar-search-clear` — 20×20
- `.legend-item` (mobile filter chips) — ~24px tall
- `.filter-sheet-close` (×) — ~24×30
- Mobile `.show-on-map-button` — borderline
*Fix:* Increase padding / minimum dimensions on mobile breakpoints; pad the clear-search hit-area without growing the visual control.

**3. Selected-row state isn't exposed to assistive tech.**
`.record-row.selected` is a CSS class only. Screen readers see the same row whether selected or not.
*File:* `Sidebar.tsx` line 76 (`<li>`), 82 (`<button>`).
*Fix:* `aria-current="true"` on the selected row's button, or `aria-pressed` if treating the row as a toggle.

**4. Toggle buttons don't expose pressed state** — WCAG 4.1.2.
Legend chips and filter-sheet chips toggle a category in/out of the active filter, but use neither `aria-pressed` nor `role="switch"`. Screen reader users hear "European and Classical Antiquity, button" but not whether it's currently active.
*Files:* `Legend.tsx` line 18, `FilterSheet.tsx` line 55.
*Fix:* `aria-pressed={active}` on each chip button.

**5. Filters button doesn't announce that it controls a dialog.**
The mobile "Filters" button opens the filter sheet but has no `aria-haspopup` / `aria-expanded` / `aria-controls`.
*File:* `App.tsx` line 204–212.
*Fix:* `aria-haspopup="dialog"`, `aria-expanded={filterSheetOpen}`, `aria-controls="filter-sheet"`.

### Tier 2 — Significant (fix soon)

**6. `.muted` opacity 0.45 likely fails contrast for the text inside** — WCAG 1.4.3.
A category chip in the inactive state gets `opacity: 0.45`, which visually multiplies against the already-#212121 text on #fff and almost certainly drops contrast below 4.5:1. The intent (dim inactive chips) is right; the technique compounds with text color.
*File:* `index.css` line 118–120.
*Fix:* Replace opacity with explicit foreground/background colors that meet contrast at the inactive state. Keep the swatch transparent-fill, but darken/lighten text deliberately.

**7. Dynamic content updates aren't announced** — WCAG 4.1.3.
The header's count line (`{mappable.length} mapped (of {resolvedTotal}) · {unmappedCount} unmapped … · {month.records.length} total`) changes silently when the filter, search, or month changes. The "Loading {month}…" state likewise.
*File:* `App.tsx` line 184–195.
*Fix:* Wrap the count line in `aria-live="polite"` (or `role="status"`). Mark the loading line similarly.

**8. Map container has no landmark or label.**
Leaflet's `MapContainer` renders a `<div class="map">` with no role/aria-label. Screen reader users navigating by landmark won't see the map at all.
*File:* `Map.tsx` line 50.
*Fix:* Pass `role="region"` and `aria-label="Acquisitions map"` to `<MapContainer>` (or wrap with a labelled `<section>`). Map markers themselves remain inaccessible by default — see Tier 3.

**9. Search input has no programmatic label** — WCAG 1.3.1, 3.3.2.
It has `aria-label="Search records"` (good), but no visible label or `<label for>`. For users who don't need AT, the placeholder is the only hint. Acceptable for a compact search box but worth flagging.
*File:* `Sidebar.tsx` line 40–46.
*Fix:* Optional — visually-hidden `<label>` for redundancy, or accept the aria-label as sufficient.

**10. Focus styles are inconsistent.**
Some controls use `:focus-visible` (good — only shows on keyboard navigation). `.record-row-button:focus` uses `:focus` (shows on every click too). Several buttons have no focus style at all (e.g., `.legend-item`, `.legend-reset`, `.month-nav-arrow`).
*Files:* `index.css` throughout.
*Fix:* Standardize on `:focus-visible` with a consistent outline (`2px solid #0066cc`, `2px` offset). Audit every `:hover` rule and add a paired `:focus-visible`.

**11. `<h1>` wrapped in a button is unusual.**
Functionally correct (button-as-heading), but some screen readers may announce it confusingly ("button, ISAW Library New Titles, level 1"). The reset-on-click behavior is also undiscoverable.
*File:* `App.tsx` line 175–183.
*Fix options:* Keep the button for the click affordance but add an `aria-label` that explains the action ("Reset map view, ISAW Library New Titles"); or move the reset action to the home control on the map and demote the title to plain text.

**12. Filter sheet close button uses `×` only.**
`aria-label="Close filters"` is set ✓, but the visible character is `×` (multiplication sign) — at 1.6rem the hit target is also small.
*File:* `FilterSheet.tsx` line 47.
*Fix:* Increase tap area (Tier 1.2 covers it); consider adding an SVG close icon for clarity.

### Tier 3 — Nice-to-have

**13. No skip-link to main content.**
Keyboard users have to tab through every header/legend control to reach the sidebar list.
*Fix:* Add a visually-hidden "Skip to record list" anchor at the top of `<App>`.

**14. Filter group has no accessible group label.**
The legend strip is a row of toggle chips — semantically a group. A screen reader reads each in isolation.
*Fix:* Wrap legend chips in `<div role="group" aria-label="Region filters">` (or `<fieldset>` if rendered as such).

**15. Map markers aren't keyboard accessible.**
Known Leaflet limitation. The sidebar provides parallel access, so this is mitigated rather than a hard blocker. Keyboard-driven map navigation would require either (a) a Leaflet a11y plugin, or (b) a list-overlay control. Defer.

**16. `prefers-color-scheme: dark` not handled.**
Hard-coded light theme. Out of scope for an a11y audit per se, but worth noting alongside motion.

**17. CI accessibility gate.**
No automated a11y check today. A pa11y-ci or axe-core run in `ci.yml` would catch regressions.

### Already correct ✓

- HTML `lang="en"` set on the document.
- `<title>` and `<meta name="description">` populated.
- Filter sheet uses native `<dialog>` — focus trap and Escape-to-close are handled by the browser.
- Filter sheet has `aria-labelledby` pointing to its visible heading.
- Mobile view toggle has a meaningful `aria-label` that updates with state.
- Sidebar uses semantic `<aside>`, list uses `<ol>`, rows use `<button>`.
- `<header>` is a real landmark.
- All interactive elements are real `<button>` elements (no clickable `<div>`s).
- Search input has an `aria-label`.

## Suggested fix order

1. **Tier 1, items 1–5.** All small in surface area, big in user impact. ~one short PR each, or one bundled PR if reviewing together.
2. **Tier 2, items 6, 7, 10.** Contrast, live regions, focus-style consistency are repo-wide changes; do them together so the visual diff is reviewable in one pass.
3. **Tier 2, items 8, 11.** Map landmark + heading-button decision. Discuss UX trade-offs before changing.
4. **Tier 3.** Pick what fits — skip-link is cheap, a11y CI is a worthwhile setup but a project of its own.

## Open questions for the team

- Which institutional guidelines apply (NYU's, ISAW's, a vendor's WCAG profile)? They may add criteria beyond AA.
- Is there a preferred screen-reader pair to test against (NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari)? If institutional users are predominantly one stack, prioritize verification there.
- Is there an existing a11y review process (manual review, paid audit, accessibility office)? The findings here would feed in.

## Out of scope (this audit)

- `nt-website` HTML fragment (not yet implemented).
- `nt-classify` and `nt-recommend` (no UI yet).
- Performance / SEO / PWA — separate concerns.
- The librarian-side data ingest UI (none today).
