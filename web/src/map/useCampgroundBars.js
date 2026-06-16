import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { availabilityColor } from '../constants';

// Renders a small availability bar just to the LEFT of each campground point — a
// mapboxgl.Marker per campground whose fill height encodes total remaining
// availability (the feature's normalized `norm`). Clicking a bar selects the
// campground, like clicking its pin. Markers are rebuilt when the features change
// (date/season/filter) and removed on cleanup.
export function useCampgroundBars({ map, ready, features, onSelect }) {
  const markersRef = useRef([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map || !ready) return undefined;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    for (const f of features?.features ?? []) {
      const p = f.properties || {};
      const norm = Math.max(0, Math.min(1, Number(p.norm) || 0));
      const [lng, lat] = f.geometry.coordinates;

      const el = document.createElement('div');
      el.className = 'cg-bar';
      el.title = `${p.name}: ${p.metric ?? 0} remaining`;
      const fill = document.createElement('div');
      fill.className = 'cg-bar-fill';
      // Any nonzero remaining gets a visible floor so small campgrounds still read.
      const pct = Number(p.metric) > 0 ? Math.max(14, Math.round(norm * 100)) : 0;
      fill.style.height = `${pct}%`;
      fill.style.background = availabilityColor(norm);
      el.appendChild(fill);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onSelectRef.current) onSelectRef.current(p);
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'right', offset: [-9, 0] })
        .setLngLat([lng, lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    return () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
    };
  }, [map, ready, features]);
}
