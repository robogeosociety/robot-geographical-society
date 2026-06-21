// Pure derivations over the /watch payload (the hot-date fill-curves). The Worker
// returns each watch as a series of observed points ({ ts, available, reserved, total });
// the view's chart + ranking are computed from them here so the math is unit-testable
// independent of React.

// Share of a campground-night that's booked at one observation: reserved / total.
// `total` includes "other" (not-yet-released / not-reservable), so this is the true
// fraction of the night's inventory already spoken for. 0 when nothing was captured.
export function bookedPct({ reserved = 0, total = 0 } = {}) {
  return total > 0 ? reserved / total : 0;
}

// The latest observation's booked fraction — how full the night is *right now*. Used to
// rank watches (hottest first) and color the pin/badge.
export function latestFill(curve) {
  const points = curve?.points ?? [];
  const last = points[points.length - 1];
  return last ? bookedPct(last) : (Number.isFinite(curve?.fill) ? curve.fill : 0);
}

// Normalize a fill-curve for plotting: each point gets `pct` (booked fraction 0..1) and
// an `x` in [0,1] spread evenly across the observation count (the watch cadence is
// adaptive, so even spacing reads cleaner than true-time spacing for a thumbnail). The
// series is returned in observation order. Empty series → [].
export function curvePoints(points = []) {
  const n = points.length;
  return points.map((p, i) => ({
    ts: p.ts,
    pct: bookedPct(p),
    reserved: p.reserved ?? 0,
    available: p.available ?? 0,
    total: p.total ?? 0,
    x: n <= 1 ? 0 : i / (n - 1),
  }));
}

// Build an SVG points string (in a width×height box, padded) for a fill-curve so the
// chart component stays declarative. y is inverted (0% booked at the bottom). Returns
// { line, area } point strings, or null for an empty series.
export function curveGeometry(points = [], { width = 200, height = 60, pad = 2 } = {}) {
  const pts = curvePoints(points);
  if (pts.length === 0) return null;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = (v) => pad + v * w;
  const y = (pct) => pad + h - pct * h;
  const line = pts.map((p) => `${x(p.x).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${(pad + h).toFixed(1)} ${line} ${x(1).toFixed(1)},${(pad + h).toFixed(1)}`;
  return { line, area };
}

// Watches ranked by current fill, hottest first; ties broken by the soonest target
// night. Does not mutate the input.
export function rankWatches(watches = []) {
  return [...watches].sort(
    (a, b) => latestFill(b) - latestFill(a) ||
      (a.target_date < b.target_date ? -1 : a.target_date > b.target_date ? 1 : 0),
  );
}

// Fill ramp: hot (mostly booked) = red, cold (mostly open) = green — "full" is the
// signal a watch is tracking, so it mirrors the Demand ramp.
export function fillColor(pct) {
  if (pct >= 0.66) return '#F85149';
  if (pct >= 0.33) return '#D29922';
  return '#3FB950';
}
