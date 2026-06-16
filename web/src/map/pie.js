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

// A small agency-colored disc drawn as a "pac-man" pie: the filled wedge spans
// `fraction` of the circle (remaining availability for the rest of the year), so a
// near-full disc = lots open, a thin wedge = mostly booked. Color carries agency;
// only the cutout carries availability. A fully-booked campground is a hollow ring.
export function pacmanMarkup(fraction, { radius = 8, color = '#888888' } = {}) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const size = radius * 2 + 2;
  const c = size / 2;
  const stroke = 'stroke="rgba(0,0,0,0.45)" stroke-width="0.75"';

  let body;
  if (f <= 0) {
    body = `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="#6E7681" stroke-width="1.5"/>`;
  } else if (f >= 1) {
    body = `<circle cx="${c}" cy="${c}" r="${radius}" fill="${color}" ${stroke}/>`;
  } else {
    body = `<path d="${slicePath(c, c, radius, 0, f * 360)}" fill="${color}" ${stroke}/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
}
