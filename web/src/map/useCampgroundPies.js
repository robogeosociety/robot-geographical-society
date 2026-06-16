import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { AGENCY_COLORS, agencyShort } from '../constants';
import { pieMarkup } from './pie';

// Renders each campground as a seasonal-availability PIE marker at its point: slices
// sized by remainingBySeason, the disc radius scaled (log) by total remaining for the
// year, an agency-colored ring. `highlightSeason` dims the other slices. Clicking a
// pie selects the campground; clicking empty map deselects. Rebuilt when rows or the
// highlight change; removed on cleanup.
export function useCampgroundPies({ map, ready, rows, highlightSeason = 'all', onSelect, onEmpty }) {
  const markersRef = useRef([]);
  const onSelectRef = useRef(onSelect);
  const onEmptyRef = useRef(onEmpty);
  onSelectRef.current = onSelect;
  onEmptyRef.current = onEmpty;

  useEffect(() => {
    if (!map || !ready) return undefined;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const valid = (rows ?? []).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    const max = Math.max(1, ...valid.map((r) => r.remaining ?? 0));
    const denom = Math.log1p(max);
    const radiusFor = (rem) => Math.round(8 + (denom > 0 ? Math.log1p(Math.max(0, rem)) / denom : 0) * 14);

    for (const r of valid) {
      const ring = AGENCY_COLORS[agencyShort(r.agency)] || '#888888';
      const el = document.createElement('div');
      el.className = 'cg-pie';
      el.title = `${r.name}: ${r.remaining ?? 0} remaining`;
      el.innerHTML = pieMarkup(r.remainingBySeason, { radius: radiusFor(r.remaining ?? 0), highlight: highlightSeason, ring });
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
  }, [map, ready, rows, highlightSeason]);

  // Deselect when clicking empty map (pie clicks stopPropagation, so this is canvas-only).
  useEffect(() => {
    if (!map || !ready) return undefined;
    const handler = () => onEmptyRef.current?.();
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [map, ready]);
}
