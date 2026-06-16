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
// agency-colored outline, over which a "pac-man" wedge — also agency-colored — spans
// `fraction` of the circle (remaining availability for the rest of the year). So a
// near-full disc = lots open, a thin wedge = mostly booked, an (almost) empty light
// disc = fully booked. Color carries agency; only the wedge carries availability.
export function pacmanMarkup(fraction, { radius = 8, color = '#888888' } = {}) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const size = radius * 2 + 2;
  const c = size / 2;

  // Light background disc → the whole circle reads (and clicks) as a point.
  let svg = `<circle cx="${c}" cy="${c}" r="${radius}" fill="rgba(255,255,255,0.82)"/>`;
  // Availability wedge in the agency color.
  if (f >= 1) {
    svg += `<circle cx="${c}" cy="${c}" r="${radius}" fill="${color}"/>`;
  } else if (f > 0) {
    svg += `<path d="${slicePath(c, c, radius, 0, f * 360)}" fill="${color}"/>`;
  }
  // Agency-color outline around the circle.
  svg += `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${color}" stroke-width="1.5"/>`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svg}</svg>`;
}
