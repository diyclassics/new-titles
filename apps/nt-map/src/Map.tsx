import type { Acquisition } from '@nt/data/schema';
import L from 'leaflet';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
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
  onSelect: (id: string) => void;
};

/** Imperative handle exposed from MapView — App calls these directly. */
export interface MapHandle {
  flyTo: (place: { lat: number; lon: number }) => void;
  reset: () => void;
  openMarker: (id: string) => void;
}

const DEFAULT_CENTER: [number, number] = [36, 40];
const DEFAULT_ZOOM = 4;

// Tile layer — swappable via .env.local. Default is the AWMC / CAWM basemap
// (Consortium of Ancient World Mappers, hosted at the University of Iowa).
const TILE_URL =
  import.meta.env.VITE_TILE_URL ?? 'https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ??
  'Tiles &copy; <a href="https://awmc.unc.edu/awmc/" target="_blank" rel="noreferrer">AWMC</a>, via <a href="https://cawm.lib.uiowa.edu/" target="_blank" rel="noreferrer">CAWM / Iowa</a>';

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

export default MapView;

/** Wires up the imperative handle once the map is available via useMap(). */
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
      flyTo: (place) => {
        // Defend against stale cached pixel dimensions: if the map was hidden
        // (mobile List tab) or the viewport changed since last paint, Leaflet's
        // animation will target the wrong size. invalidateSize() is a no-op
        // when the size is unchanged.
        map.invalidateSize();
        map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 6), { duration: 0.6 });
      },
      reset: () => map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true }),
      openMarker: (id) => {
        const marker = markersByIdRef.current.get(id);
        const group = clusterGroupRef.current;
        if (!marker || !group) return;
        map.invalidateSize();
        // zoomToShowLayer expands any clusters containing the marker, then
        // calls back so we can open the popup once the marker is on-screen.
        group.zoomToShowLayer(marker, () => marker.openPopup());
      },
    }),
    [map, markersByIdRef, clusterGroupRef],
  );
  return null;
}

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
      );
      // Use popupopen (not click) so syncing the sidebar doesn't race with
      // Leaflet's own popup-opening.
      marker.on('popupopen', () => onSelect(r.id));
      group.addLayer(marker);
      markersByIdRef.current.set(r.id, marker);
    }
  }, [records, placesById, classificationsById, onSelect, markersByIdRef, clusterGroupRef]);

  return null;
}

function HomeControl() {
  const map = useMap();
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
          map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
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
