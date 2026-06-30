import { MAP_PITCH } from '../constants';

// Cinematic fly-to used when a campground/collector/watch is selected. The camera
// banks down into the valley — easing into an oblique pitch and settling — instead
// of the old snap-zoom. Respects prefers-reduced-motion (jumps instantly).
//
// Mirrors the prior behaviour in one place: never zooms out (max of current/target).
export function flyToCampground(map, lng, lat, { zoom = 9 } = {}) {
  if (!map || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
  const targetZoom = Math.max(map.getZoom(), zoom);
  const reduce = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  if (reduce) {
    map.jumpTo({ center: [lng, lat], zoom: targetZoom });
    return;
  }

  map.flyTo({
    center: [lng, lat],
    zoom: targetZoom,
    pitch: Math.max(map.getPitch(), MAP_PITCH),
    duration: 1400,
    curve: 1.42,
    // ease-out cubic ≈ --ease-fly cubic-bezier(.22,1,.36,1): quick lift, soft landing.
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true,
  });
}
