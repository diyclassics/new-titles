import type { Acquisition } from '@nt/data/schema';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { CATEGORY_COLOR, type Category } from './data.ts';
import type { ResolvedPlace } from './types.ts';

type Props = {
  records: readonly Acquisition[];
  placesById: Record<string, ResolvedPlace>;
  classificationsById: Record<string, Category>;
  selectedRecord: Acquisition | null;
  selectedPlace: ResolvedPlace | null;
  /** Monotonically-increasing counter from the sidebar that requests a fly. */
  flySignal: number;
  onSelect: (id: string) => void;
};

const DEFAULT_CENTER: [number, number] = [36, 40];
const DEFAULT_ZOOM = 4;

// Tile layer — swappable via .env.local. Default is the AWMC / CAWM basemap
// (Consortium of Ancient World Mappers, hosted at the University of Iowa).
const TILE_URL =
  import.meta.env.VITE_TILE_URL ?? 'https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ??
  'Tiles &copy; <a href="https://awmc.unc.edu/awmc/" target="_blank" rel="noreferrer">AWMC</a>, via <a href="https://cawm.lib.uiowa.edu/" target="_blank" rel="noreferrer">CAWM / Iowa</a>';

export function MapView({
  records,
  placesById,
  classificationsById,
  selectedRecord,
  selectedPlace,
  flySignal,
  onSelect,
}: Props) {
  return (
    <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="map">
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <ClusterLayer
        records={records}
        placesById={placesById}
        classificationsById={classificationsById}
        onSelect={onSelect}
      />
      <FlyToSelected place={selectedPlace} record={selectedRecord} signal={flySignal} />
    </MapContainer>
  );
}

function ClusterLayer({
  records,
  placesById,
  classificationsById,
  onSelect,
}: Pick<Props, 'records' | 'placesById' | 'classificationsById' | 'onSelect'>) {
  const map = useMap();
  const clusterGroupRef = useRef<ReturnType<typeof L.markerClusterGroup> | null>(null);

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 40,
      // Category-aware cluster color: solid category color if all children
      // share one region, neutral dark gray if mixed. Replaces markercluster's
      // default count-based green/yellow/red palette, which collides with
      // our per-category marker colors.
      iconCreateFunction: (cluster) => {
        const categories = new Set<Category>();
        for (const m of cluster.getAllChildMarkers()) {
          const cat = (m.options as { _category?: Category })._category;
          if (cat) categories.add(cat);
        }
        const count = cluster.getChildCount();
        const color =
          categories.size === 1 ? CATEGORY_COLOR[[...categories][0] as Category] : '#4a5568';
        const mixed = categories.size > 1 ? ' mixed' : '';
        return L.divIcon({
          html: `<div class="cluster-dot${mixed}" style="background:${color}"><span>${count}</span></div>`,
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
  }, [map]);

  useEffect(() => {
    const group = clusterGroupRef.current;
    if (!group) return;
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
      marker.bindPopup(
        `<div class="popup">
          <strong>${escapeHtml(r.title)}</strong>
          ${r.authors.length > 0 ? `<div>${escapeHtml(r.authors.join(', '))}</div>` : ''}
          ${r.publisher ? `<div class="muted">${escapeHtml(r.publisher)}</div>` : ''}
          ${r.call_number ? `<div class="callno">${escapeHtml(r.call_number)}</div>` : ''}
          <div class="muted">📍 ${placeLabel} ${sourceTag}</div>
          ${category ? `<div class="muted" style="color:${color}"><strong>${escapeHtml(category)}</strong></div>` : ''}
          ${bobcat}
        </div>`,
      );
      // Use popupopen (not click) so syncing the sidebar doesn't race with
      // Leaflet's own popup-opening. When a cluster spiderfies and the user
      // clicks a spiderfied marker, `click` + a state-driven map.flyTo would
      // sometimes close the popup before it settled.
      marker.on('popupopen', () => onSelect(r.id));
      group.addLayer(marker);
    }
  }, [records, placesById, classificationsById, onSelect]);

  return null;
}

function FlyToSelected({
  place,
  record,
  signal,
}: {
  place: ResolvedPlace | null;
  record: Acquisition | null;
  /** Only flies when signal increments — so sidebar clicks fly,
   *  marker clicks (which don't bump signal) don't interrupt the popup. */
  signal: number;
}) {
  const map = useMap();
  // biome-ignore lint/correctness/useExhaustiveDependencies: only fly when `signal` changes.
  useEffect(() => {
    if (!place || !record) return;
    map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 6), { duration: 0.6 });
  }, [signal]);
  return null;
}

function bobcatUrl(mmsId: string): string {
  const params = new URLSearchParams({
    docid: `alma${mmsId}`,
    context: 'L',
    vid: '01NYU_INST:NYU',
    lang: 'en',
    search_scope: 'CI_NYU_CONSORTIA',
    adaptor: 'Local Search Engine',
    tab: 'Unified_Slot',
    offset: '0',
  });
  return `https://search.library.nyu.edu/discovery/fulldisplay?${params.toString()}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
