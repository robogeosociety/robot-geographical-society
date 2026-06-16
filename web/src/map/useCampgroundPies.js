import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { AGENCY_COLORS, agencyShort } from '../constants';
import { pacmanMarkup } from './pie';

// Renders each campground as a small agency-colored "pac-man" disc at its point: the
// filled wedge spans its remaining availability for the rest of the year
// (remaining / remainingTotal). Color = agency; only the cutout shows availability.
// Clicking a disc selects the campground; clicking empty map deselects.
export function useCampgroundPies({ map, ready, rows, onSelect, onEmpty }) {
  const markersRef = useRef([]);
  const onSelectRef = useRef(onSelect);
  const onEmptyRef = useRef(onEmpty);
  onSelectRef.current = onSelect;
  onEmptyRef.current = onEmpty;

  useEffect(() => {
    if (!map || !ready) return undefined;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    for (const r of rows ?? []) {
      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
      const color = AGENCY_COLORS[agencyShort(r.agency)] || '#888888';
      const fraction = r.remainingTotal > 0
        ? r.remaining / r.remainingTotal
        : (r.total > 0 ? (r.available ?? 0) / r.total : 0);

      const el = document.createElement('div');
      el.className = 'cg-pie';
      el.title = `${r.name}: ${Math.round(fraction * 100)}% open the rest of the year`;
      el.innerHTML = pacmanMarkup(fraction, { radius: 8, color });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectRef.current?.(r);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([r.lng, r.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    return () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
    };
  }, [map, ready, rows]);

  // Deselect when clicking empty map (disc clicks stopPropagation, so this is canvas-only).
  useEffect(() => {
    if (!map || !ready) return undefined;
    const handler = () => onEmptyRef.current?.();
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [map, ready]);
}
