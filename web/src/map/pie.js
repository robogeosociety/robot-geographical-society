import { SEASONS, SEASON_COLORS } from '../constants';

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

// SVG markup for a campground's seasonal remaining-availability pie. Slices are sized
// by `bySeason` (Winter/Spring/Summer/Fall) and colored by season; an optional agency
// `ring` outlines it. `highlight` ('all' or a season) dims the non-selected slices.
// A fully-booked campground (sum 0) renders a hollow grey ring.
export function pieMarkup(bySeason, { radius = 14, highlight = 'all', ring = null } = {}) {
  const vals = SEASONS.map((s) => Math.max(0, Number(bySeason?.[s]) || 0));
  const sum = vals.reduce((a, b) => a + b, 0);
  const size = radius * 2 + 4;
  const c = size / 2;
  const op = (s) => (highlight === 'all' || highlight === s ? 1 : 0.18);

  let body;
  if (sum === 0) {
    body = `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="#6E7681" stroke-width="2"/>`;
  } else if (vals.filter((v) => v > 0).length === 1) {
    const s = SEASONS[vals.findIndex((v) => v > 0)];
    body = `<circle cx="${c}" cy="${c}" r="${radius}" fill="${SEASON_COLORS[s]}" fill-opacity="${op(s)}"/>`;
  } else {
    let acc = 0;
    body = SEASONS.map((s, i) => {
      const v = vals[i];
      if (v <= 0) return '';
      const start = (acc / sum) * 360;
      acc += v;
      const end = (acc / sum) * 360;
      return `<path d="${slicePath(c, c, radius, start, end)}" fill="${SEASON_COLORS[s]}" fill-opacity="${op(s)}"/>`;
    }).join('');
  }

  const outline = ring
    ? `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${ring}" stroke-width="1.5" stroke-opacity="0.9"/>`
    : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}${outline}</svg>`;
}
