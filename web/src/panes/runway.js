// Observed "availability runway" for one campsite, derived from its captured
// `by_date` calendar ({ 'YYYY-MM-DD': 'available'|'reserved'|'other' }).
//
// This is OBSERVED data, not a model prediction: the per-night booking model
// (predict/, PR #71) isn't trustworthy yet (readiness 0), so the first survival
// view plots what we've actually captured. A model-predicted curve is a future
// swipe-option once readiness clears.
//
// The curve is survival-shaped: y = available nights remaining looking forward from
// night t (a non-increasing count), x = nights ahead across the booking horizon.
// "Exhaustion" is the observed point availability runs out — the last available night.
export function computeRunway(byDate, { from } = {}) {
  const all = Object.keys(byDate || {}).sort();
  const dates = from ? all.filter((d) => d >= from) : all;
  const n = dates.length;
  const avail = dates.map((d) => (byDate[d] === 'available' ? 1 : 0));

  // remaining[i] = available nights from i to the end (suffix sum) → the runway left.
  const remaining = new Array(n);
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) { acc += avail[i]; remaining[i] = acc; }

  // Exhaustion = the last available night; availability runs out after it.
  let exhaustionIndex = -1;
  for (let i = n - 1; i >= 0; i--) { if (avail[i]) { exhaustionIndex = i; break; } }

  return {
    dates,
    avail,
    remaining,
    n,
    availableNights: remaining[0] ?? 0,
    exhaustionIndex,
    exhaustionDate: exhaustionIndex >= 0 ? dates[exhaustionIndex] : null,
    availableNow: n > 0 ? avail[0] === 1 : false,
  };
}
