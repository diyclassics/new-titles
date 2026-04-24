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
  onSelect: (id: string) => void;
};

const DEFAULT_CENTER: [number, number] = [36, 40];
const DEFAULT_ZOOM = 4;

// Tile layer — swappable via .env.local. Default is the DARE/AWMC Roman-empire
// basemap, which is the same AWMC cartography Pleiades uses.
const TILE_URL = import.meta.env.VITE_TILE_URL ?? 'https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION ??
  'Tiles &copy; <a href="https://awmc.unc.edu/awmc/" target="_blank" rel="noreferrer">AWMC</a>, via <a href="https://dh.gu.se/dare/" target="_blank" rel="noreferrer">DARE</a>';

export function MapView({
  records,
  placesById,
  classificationsById,
  selectedRecord,
  selectedPlace,
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
      <FlyToSelected place={selectedPlace} record={selectedRecord} />
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
      });

      const bobcat = r.barcode
        ? `<a href="https://bobcat.library.nyu.edu/primo-explore/search?query=any,contains,${r.barcode}&vid=NYU" target="_blank" rel="noreferrer">View in Bobcat →</a>`
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
      marker.on('click', () => onSelect(r.id));
      group.addLayer(marker);
    }
  }, [records, placesById, classificationsById, onSelect]);

  return null;
}

function FlyToSelected({
  place,
  record,
}: {
  place: ResolvedPlace | null;
  record: Acquisition | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (place && record) {
      map.flyTo([place.lat, place.lon], Math.max(map.getZoom(), 6), { duration: 0.6 });
    }
  }, [place, record, map]);
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
