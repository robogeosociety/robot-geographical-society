import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { AGENCY_COLORS, agencyShort } from '../constants';
import { pacmanMarkup } from './pie';

// requestAnimationFrame where available (browser/jsdom), else a timeout shim (bare
// Node) — so the batched placement below works in every environment.
const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
const unschedule = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;

// Renders each campground as a small agency-colored "pac-man" disc at its point: the
// filled wedge spans its remaining availability for the rest of the year
// (remaining / remainingTotal). Color = agency; only the cutout shows availability.
// Clicking a disc selects the campground; clicking empty map deselects.
//
// Markers are placed **progressively** — a batch per animation frame — so the points
// fan onto the map instead of the main thread janking on ~156 DOM markers at once.
// `onProgress(placed, total)` fires after each batch (and once with (0, total) up
// front), driving the determinate loading bar; `batchSize` tunes the fan-in cadence.
export function useCampgroundPies({ map, ready, rows, onSelect, onEmpty, onProgress, selectedGuid, batchSize = 16 }) {
  const markersRef = useRef([]);
  const elsRef = useRef(new Map()); // guid → marker element, for selection styling
  const onSelectRef = useRef(onSelect);
  const onEmptyRef = useRef(onEmpty);
  const onProgressRef = useRef(onProgress);
  const selectedGuidRef = useRef(selectedGuid);
  onSelectRef.current = onSelect;
  onEmptyRef.current = onEmpty;
  onProgressRef.current = onProgress;
  selectedGuidRef.current = selectedGuid;

  useEffect(() => {
    if (!map || !ready) return undefined;

    const els = elsRef.current; // stable Map; captured for the cleanup closure
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    els.clear();

    const points = (rows ?? []).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    const total = points.length;
    onProgressRef.current?.(0, total);

    let frame = 0;
    let i = 0;
    const placeBatch = () => {
      const end = Math.min(i + batchSize, total);
      for (; i < end; i++) {
        const r = points[i];
        const color = AGENCY_COLORS[agencyShort(r.agency)] || '#888888';
        const fraction = r.remainingTotal > 0
          ? r.remaining / r.remainingTotal
          : (r.total > 0 ? (r.available ?? 0) / r.total : 0);

        const el = document.createElement('div');
        el.className = 'cg-pie';
        // The agency hue drives the CSS glow (drop-shadow) + selected pulse — the
        // beacon treatment lives in app.css keyed on this custom property.
        el.style.setProperty('--beacon-color', color);
        el.title = `${r.name}: ${Math.round(fraction * 100)}% open the rest of the year`;
        el.innerHTML = pacmanMarkup(fraction, { radius: 8, color });
        if (r.guid != null) {
          el.dataset.guid = r.guid;
          els.set(r.guid, el);
          if (r.guid === selectedGuidRef.current) el.classList.add('cg-pie--selected');
        }
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current?.(r);
        });
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([r.lng, r.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
      onProgressRef.current?.(i, total);
      if (i < total) frame = schedule(placeBatch);
    };
    if (total > 0) frame = schedule(placeBatch);

    return () => {
      if (frame) unschedule(frame);
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      els.clear();
    };
  }, [map, ready, rows, batchSize]);

  // Light up the selected campground's beacon without rebuilding the marker layer.
  useEffect(() => {
    for (const [guid, el] of elsRef.current) {
      el.classList.toggle('cg-pie--selected', guid === selectedGuid);
    }
  }, [selectedGuid, rows]);

  // Deselect when clicking empty map (disc clicks stopPropagation, so this is canvas-only).
  useEffect(() => {
    if (!map || !ready) return undefined;
    const handler = () => onEmptyRef.current?.();
    map.on('click', handler);
    return () => map.off('click', handler);
  }, [map, ready]);
}
