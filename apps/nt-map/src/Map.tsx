import type { Acquisition } from '@nt/data/schema';
import L from 'leaflet';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { CATEGORY_COLOR, type Category } from './data.ts';
import { bobcatUrl, cleanAuthor, cleanTitle } from './format.ts';
import type { ResolvedPlace } from './types.ts';

type Props = {
  records: readonly Acquisition[];
  placesById: Record<string, ResolvedPlace>;
  classificationsById: Record<string, Category>;
  /** URL-driven selection. Map opens the matching marker (and pans/breaks any
   *  enclosing cluster) whenever this changes — including on first mount, so
   *  deep-link share URLs work without a race against the lazy Map chunk. */
  selectedId: string | null;
  /** Whether the map's container is currently visible. On mobile the sidebar
   *  hides the map via display:none; when it returns we have to invalidateSize
   *  on the next frame so Leaflet re-measures and re-fetches tiles. */
  visible: boolean;
  /** Honors the OS-level prefers-reduced-motion preference. When true, all
   *  pan/zoom transitions and Leaflet's internal animations are disabled. */
  reducedMotion: boolean;
  onSelect: (id: string) => void;
};

/** Imperative handle exposed from MapView — App calls these for view-only
 *  actions that don't belong in URL state (e.g., the "Reset view" header
 *  button). Selection-driven popup opening is handled via the selectedId
 *  prop, not this handle. */
export interface MapHandle {
  reset: () => void;
}

const DEFAULT_CENTER: [number, number] = [36, 40];
const DEFAULT_ZOOM = 4;
// CAWM/AWMC tiles top out around zoom 11. Without an explicit cap, the default
// Leaflet maxZoom of 18 lets zoomToShowLayer (used to break clusters around a
// selected marker) zoom past the tile range, leaving an all-gray basemap.
const MAX_ZOOM = 11;

// Tile layer — swappable via .env.local. Default is the AWMC / CAWM basemap
// (Consortium of Ancient World Mappers, hosted at the University of Iowa).
const TILE_URL =
  import.meta.env.VITE_TILE_URL ?? 'https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ??
  'Tiles &copy; <a href="https://awmc.unc.edu/awmc/" target="_blank" rel="noreferrer">AWMC</a>, via <a href="https://cawm.lib.uiowa.edu/" target="_blank" rel="noreferrer">CAWM / Iowa</a>';

export const MapView = forwardRef<MapHandle, Props>(function MapView(
  { records, placesById, classificationsById, selectedId, visible, reducedMotion, onSelect },
  ref,
) {
  const markersByIdRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      maxZoom={MAX_ZOOM}
      // Disable Leaflet's built-in animations under prefers-reduced-motion.
      // These are init-time options; the user changing the OS preference
      // mid-session would require a refresh — acceptable since the setting
      // is rarely toggled.
      zoomAnimation={!reducedMotion}
      fadeAnimation={!reducedMotion}
      markerZoomAnimation={!reducedMotion}
      className="map"
      aria-label="Acquisitions map"
    >
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
        maxZoom={MAX_ZOOM}
        eventHandlers={
          import.meta.env.DEV
            ? {
                tileerror: (e) => console.warn('[Map] tile error', e),
                load: () => console.log('[Map] tile layer loaded'),
              }
            : {}
        }
      />
      <ClusterLayer
        records={records}
        placesById={placesById}
        classificationsById={classificationsById}
        selectedId={selectedId}
        reducedMotion={reducedMotion}
        onSelect={onSelect}
        markersByIdRef={markersByIdRef}
        clusterGroupRef={clusterGroupRef}
      />
      <VisibilitySync visible={visible} />
      <HandleBridge handleRef={ref} reducedMotion={reducedMotion} />
      <HomeControl reducedMotion={reducedMotion} />
    </MapContainer>
  );
});

export default MapView;

/** Keep Leaflet's cached pixel dimensions in sync with the map container's
 *  actual size. The mobile list↔map swap toggles `display: none`, which a
 *  same-tick `invalidateSize` may measure before the browser has reflowed —
 *  resulting in 0×0 dimensions that evict all tiles. ResizeObserver fires
 *  *after* layout, so by the time we invalidate the container's clientWidth
 *  is correct and tile fetches go to the right viewport. */
function VisibilitySync({ visible }: { visible: boolean }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const sizeChanged = w !== lastW || h !== lastH;
      lastW = w;
      lastH = h;
      // Skip the swap to display:none (size goes to 0) — invalidating then
      // would only re-evict tiles. Re-measure when we have real dimensions.
      if (sizeChanged && w > 0 && h > 0) {
        map.invalidateSize();
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);

  // Belt-and-braces JS-side fallback: when our visible flag flips on, also
  // invalidate on the next frame in case ResizeObserver hasn't fired yet
  // (e.g., container size technically didn't change, only display did).
  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => {
      map.invalidateSize();
    });
    return () => cancelAnimationFrame(id);
  }, [visible, map]);

  return null;
}

/** Wires up the imperative handle once the map is available via useMap(). */
function HandleBridge({
  handleRef,
  reducedMotion,
}: {
  handleRef: React.ForwardedRef<MapHandle>;
  reducedMotion: boolean;
}) {
  const map = useMap();
  useImperativeHandle(
    handleRef,
    () => ({
      reset: () => {
        map.closePopup();
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: !reducedMotion });
      },
    }),
    [map, reducedMotion],
  );
  return null;
}

function ClusterLayer({
  records,
  placesById,
  classificationsById,
  selectedId,
  reducedMotion,
  onSelect,
  markersByIdRef,
  clusterGroupRef,
}: Pick<
  Props,
  'records' | 'placesById' | 'classificationsById' | 'selectedId' | 'reducedMotion' | 'onSelect'
> & {
  markersByIdRef: React.MutableRefObject<Map<string, L.CircleMarker>>;
  clusterGroupRef: React.MutableRefObject<L.MarkerClusterGroup | null>;
}) {
  const map = useMap();
  // Bumped each time the marker layer is rebuilt. The selection effect below
  // depends on this so it re-runs once new markers are in place — that's how
  // a deep-link share URL opens the right popup on first paint.
  const [markersVersion, setMarkersVersion] = useState(0);
  // Mirror selectedId in a ref so the refit effect can read it without taking
  // it as a dependency (which would re-trigger on every selection change).
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 40,
      iconCreateFunction: (cluster) => {
        // Per-category counts within this cluster.
        const counts = new Map<Category, number>();
        for (const m of cluster.getAllChildMarkers()) {
          const cat = (m.options as { _category?: Category })._category;
          if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        const total = cluster.getChildCount();
        let maxCount = 0;
        let winners: Category[] = [];
        for (const [cat, n] of counts) {
          if (n > maxCount) {
            maxCount = n;
            winners = [cat];
          } else if (n === maxCount) {
            winners.push(cat);
          }
        }
        // Black only breaks genuine ties; otherwise take the dominant color.
        const color = winners.length === 1 ? CATEGORY_COLOR[winners[0] as Category] : '#111';
        return L.divIcon({
          html: `<div class="cluster-dot" style="background:${color}"><span>${total}</span></div>`,
          className: 'nt-cluster',
          iconSize: [36, 36],
        });
      },
    });
    map.addLayer(group);
    clusterGroupRef.current = group;
    return () => {
      map.removeLayer(group);
      clusterGroupRef.current = null;
    };
  }, [map, clusterGroupRef]);

  useEffect(() => {
    const group = clusterGroupRef.current;
    if (!group) return;
    markersByIdRef.current.clear();
    group.clearLayers();

    for (const r of records) {
      const place = placesById[r.id];
      if (!place) continue;
      const category = classificationsById[r.id];
      const color = category ? CATEGORY_COLOR[category] : '#777';
      const marker = L.circleMarker([place.lat, place.lon], {
        radius: 7,
        color: '#222',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.85,
        // Stamped on the marker so the cluster iconCreateFunction can see it.
        _category: category,
      } as L.CircleMarkerOptions & { _category?: Category });

      const bobcat = r.mms_id
        ? `<a href="${bobcatUrl(r.mms_id)}" target="_blank" rel="noreferrer">View in Bobcat →</a>`
        : '';
      const placeLabel = `<a href="${escapeHtml(place.uri)}" target="_blank" rel="noreferrer">${escapeHtml(place.name)}</a>`;
      const sourceTag = `<span class="source-tag">${place.source === 'pleiades' ? 'Pleiades' : 'TGN'}</span>`;
      const title = cleanTitle(r.title);
      const authorsLine = r.authors.map(cleanAuthor).filter(Boolean).join(', ');
      const pubLine = [r.publisher, r.pub_date].filter(Boolean).join(', ');
      marker.bindPopup(
        `<div class="popup">
          <strong>${escapeHtml(title)}</strong>
          ${authorsLine ? `<div>${escapeHtml(authorsLine)}</div>` : ''}
          ${pubLine ? `<div class="muted">${escapeHtml(pubLine)}</div>` : ''}
          ${r.call_number ? `<div class="callno">${escapeHtml(r.call_number)}</div>` : ''}
          <div class="muted">📍 ${placeLabel} ${sourceTag}</div>
          ${category ? `<div class="muted" style="color:${color}"><strong>${escapeHtml(category)}</strong></div>` : ''}
          ${bobcat}
        </div>`,
        {
          // Popups are landscape rectangles by design — wide enough that
          // each metadata field stays on a single line (with CSS ellipsis
          // when content overflows). The minWidth keeps Leaflet from
          // squishing popups when a marker is near the viewport edge;
          // autoPanPadding keeps the popup clear of the floating header
          // on top and the view-toggle pill on the bottom.
          minWidth: 240,
          maxWidth: 320,
          autoPanPadding: L.point(20, 80),
        },
      );
      // Use popupopen (not click) so syncing the sidebar doesn't race with
      // Leaflet's own popup-opening.
      marker.on('popupopen', () => onSelect(r.id));
      group.addLayer(marker);
      markersByIdRef.current.set(r.id, marker);
    }
    setMarkersVersion((v) => v + 1);
  }, [records, placesById, classificationsById, onSelect, markersByIdRef, clusterGroupRef]);

  // Reflect the URL selection on the map: open the matching marker's popup,
  // expanding any enclosing cluster. Runs on first mount (after markers build),
  // on selection change (sidebar click, share-link nav), and after rebuilds
  // (filter change keeps a still-visible selected marker open). Deferred to
  // the next frame so a same-tick view→map CSS swap has reflowed before we
  // measure — otherwise zoomToShowLayer animates from 0×0 dimensions and the
  // tile fetches go to the wrong viewport.
  useEffect(() => {
    // Skip the initial render before any marker rebuild has happened — the
    // markersByIdRef map is empty until the rebuild effect runs.
    if (markersVersion === 0) return;
    if (!selectedId) return;
    const group = clusterGroupRef.current;
    const marker = markersByIdRef.current.get(selectedId);
    if (!group || !marker) return;
    if (marker.isPopupOpen()) return;

    const dbg = (msg: string, extra?: Record<string, unknown>) => {
      if (import.meta.env.DEV) {
        const c = map.getContainer();
        console.log(
          `[Map.selection] ${msg}`,
          { id: selectedId, w: c.clientWidth, h: c.clientHeight, zoom: map.getZoom() },
          extra ?? '',
        );
      }
    };

    let cleanupRaf = 0;
    const rafId = requestAnimationFrame(() => {
      dbg('rAF fired, calling invalidateSize + zoomToShowLayer');
      map.invalidateSize();
      group.zoomToShowLayer(marker, () => {
        // Defer one more frame after zoomToShowLayer's callback so spiderfy
        // (if any) has finished setting child marker latlngs — without this,
        // the popup can anchor at the cluster center instead of the spider
        // leg position, sometimes rendering off-screen.
        dbg('zoomToShowLayer callback');
        cleanupRaf = requestAnimationFrame(() => {
          dbg('opening popup', {
            popupAnchor: marker.getLatLng(),
            isPopupOpen: marker.isPopupOpen(),
          });
          if (!marker.isPopupOpen()) marker.openPopup();
        });
      });
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (cleanupRaf) cancelAnimationFrame(cleanupRaf);
    };
  }, [selectedId, markersVersion, map, markersByIdRef, clusterGroupRef]);

  // Refit-on-empty-viewport: after a marker rebuild (filter / month / data
  // change), if no remaining marker is in the current viewport, pan/zoom to
  // fit the surviving set so the user actually sees what they filtered to.
  // When the rebuild leaves zero markers, snap back to the default view.
  // Skipped when a selected marker survived the rebuild — the selection
  // effect above will drive the view in that case.
  useEffect(() => {
    if (markersVersion === 0) return;
    const sel = selectedIdRef.current;
    if (sel && markersByIdRef.current.has(sel)) return;

    const container = map.getContainer();
    // Bounds are stale on a hidden map (mobile list view); refit will run
    // again when markers next rebuild while visible. Better than animating
    // to the wrong viewport.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    const positions: L.LatLng[] = [];
    for (const m of markersByIdRef.current.values()) {
      positions.push(m.getLatLng());
    }
    if (positions.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: !reducedMotion });
      return;
    }
    const visible = map.getBounds();
    if (positions.some((p) => visible.contains(p))) return;

    map.fitBounds(L.latLngBounds(positions), {
      padding: [40, 40],
      animate: !reducedMotion,
      maxZoom: MAX_ZOOM,
    });
  }, [markersVersion, reducedMotion, map, markersByIdRef]);

  return null;
}

function HomeControl({ reducedMotion }: { reducedMotion: boolean }) {
  const map = useMap();
  // Latest reduced-motion value via ref so the L.DomEvent click handler
  // (created once when the control mounts) reads it fresh on each click.
  const reducedMotionRef = useRef(reducedMotion);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const HomeBtn = L.Control.extend({
      options: { position: 'topleft' as const },
      onAdd: () => {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control home-control');
        const link = L.DomUtil.create('a', 'home-control-link', container);
        link.href = '#';
        link.title = 'Reset view';
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', 'Reset map view');
        link.innerHTML = '⌂';
        L.DomEvent.on(link, 'click', (e) => {
          L.DomEvent.stop(e);
          map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: !reducedMotionRef.current });
        });
        return container;
      },
    });
    const ctrl = new HomeBtn();
    ctrl.addTo(map);
    return () => {
      ctrl.remove();
    };
  }, [map]);
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
