// Pure derivations over the /demand payload. The Worker returns raw cross-campground
// aggregates ({ nights, campgrounds }); the view's three lenses — % booked by night,
// hottest nights, most in-demand campgrounds — are all computed from them here so the
// math is unit-testable independent of React.

// Share of a night that's booked: reserved / total. `total` includes "other"
// (not-yet-released / not-reservable), so this is the true fraction of the campground-
// night inventory that's spoken for. 0 when nothing was captured.
export function bookedPct({ reserved = 0, total = 0 } = {}) {
  return total > 0 ? reserved / total : 0;
}

// How in-demand a campground is: reserved / (available + reserved) — of the campsites
// that were *bookable* (open or taken), the fraction already taken. Deliberately
// excludes "other" so a campground that's mostly not-yet-released doesn't read as cold.
export function demandRatio({ available = 0, reserved = 0 } = {}) {
  const bookable = available + reserved;
  return bookable > 0 ? reserved / bookable : 0;
}

// Upcoming nights ranked by absolute demand (reserved campsite-nights), hottest first.
export function hottestNights(nights = [], n = 5) {
  return [...nights].sort((a, b) => (b.reserved ?? 0) - (a.reserved ?? 0)).slice(0, n);
}

// Campgrounds ranked by demand ratio, hottest first; ties broken by absolute reserved.
// Drops campgrounds with no bookable inventory (ratio undefined / all "other").
export function inDemandCampgrounds(campgrounds = [], n = campgrounds.length) {
  return campgrounds
    .filter((c) => (c.available ?? 0) + (c.reserved ?? 0) > 0)
    .sort((a, b) => demandRatio(b) - demandRatio(a) || (b.reserved ?? 0) - (a.reserved ?? 0))
    .slice(0, n);
}

// Demand ramp: hot (mostly booked) = red, cold (mostly open) = green — the inverse of
// the availability ramp, since here "full" is the signal, not the warning.
export function demandColor(ratio) {
  if (ratio >= 0.66) return '#F85149';
  if (ratio >= 0.33) return '#D29922';
  return '#3FB950';
}
