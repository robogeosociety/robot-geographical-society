// Shared map + agency constants, used by both views and the MapShell.

export const MAP_STYLE = 'mapbox://styles/mapbox/outdoors-v12';
export const WA_BOUNDS = [[-124.83, 45.54], [-116.92, 49.00]];

// Agency keys match the backend's `agency` short code on /collectors and
// /availability rows (e.g. "wa-state-parks", "nps", "usfs", "blm"), and the long
// names ("National Park Service", …) those endpoints also emit.
export const AGENCY_COLORS = {
  'wa-state-parks': '#A6E22E',
  nps: '#FD971F',
  usfs: '#66D9EF',
  blm: '#E6DB74',
};

export const AGENCY_LABELS = {
  'wa-state-parks': 'WA State Parks',
  nps: 'National Park Service',
  usfs: 'US Forest Service',
  blm: 'Bureau of Land Management',
};

// The endpoints emit the long agency name; map it back to a short key for coloring.
const LONG_TO_SHORT = {
  'WA State Parks': 'wa-state-parks',
  'Washington State Parks': 'wa-state-parks',
  'National Park Service': 'nps',
  'US Forest Service': 'usfs',
  'Bureau of Land Management': 'blm',
};

export function agencyShort(agency) {
  if (!agency) return '';
  return AGENCY_COLORS[agency] ? agency : (LONG_TO_SHORT[agency] || agency);
}

// Collector fleet-health states (from /collectors `state`) → color + label.
export const STATE_STYLE = {
  healthy: { color: '#3FB950', label: 'Healthy' },
  overdue: { color: '#D29922', label: 'Overdue / failing' },
  quarantined: { color: '#F85149', label: 'Quarantined' },
  disabled: { color: '#6E7681', label: 'Disabled' },
};

// Availability ramp: 0 = full/none-left (red) → 1 = lots remaining (green).
export function availabilityColor(t) {
  if (t >= 0.6) return '#3FB950';
  if (t >= 0.25) return '#D29922';
  if (t > 0) return '#E0843B';
  return '#F85149';
}

export const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'];

// Season colors for the per-campground availability pie (monokai palette).
export const SEASON_COLORS = {
  Winter: '#66D9EF',
  Spring: '#A6E22E',
  Summer: '#E6DB74',
  Fall: '#FD971F',
};
