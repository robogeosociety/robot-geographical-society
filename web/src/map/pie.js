function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function slicePath(cx, cy, r, start, end) {
  const [x0, y0] = polar(cx, cy, r, start);
  const [x1, y1] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

// A small agency disc: a light-filled circle (the clickable point) with an
// agency-colored outline. The disc reads like a draining gauge — it starts full and
// empties *clockwise* from 12 o'clock as the campground books up. The remaining
// availability is the solid agency-colored wedge (the tail of the clockwise sweep);
// the drained/booked portion is the same color at low opacity. So a near-full solid
// disc = lots open, a thin solid wedge = mostly booked, an all-faint disc = fully
// booked. Color carries agency; the solid/faint split carries availability.
const EMPTY_OPACITY = 0.22;

export function pacmanMarkup(fraction, { radius = 8, color = '#888888' } = {}) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const size = radius * 2 + 2;
  const c = size / 2;

  // Light background disc → the whole circle reads (and clicks) as a point.
  let svg = `<circle cx="${c}" cy="${c}" r="${radius}" fill="rgba(255,255,255,0.82)"/>`;
  // Faint full disc in the agency color: the drained (booked) fill, shown at low opacity.
  svg += `<circle cx="${c}" cy="${c}" r="${radius}" fill="${color}" fill-opacity="${EMPTY_OPACITY}"/>`;
  // Remaining-availability wedge at full opacity. The empty portion drains clockwise from
  // the top, so the solid wedge occupies the tail of the sweep: [(1 - f)·360°, 360°].
  if (f >= 1) {
    svg += `<circle cx="${c}" cy="${c}" r="${radius}" fill="${color}"/>`;
  } else if (f > 0) {
    svg += `<path d="${slicePath(c, c, radius, (1 - f) * 360, 360)}" fill="${color}"/>`;
  }
  // Agency-color outline around the circle.
  svg += `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${color}" stroke-width="1.5"/>`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svg}</svg>`;
}
