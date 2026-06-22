// Pure derivations for the Calendar view. A "standard" month-grid calendar (weekday
// columns, Sun→Sat) is built from a date→value map; the view supplies either an
// availability rollup ({available,reserved,total}) per night for the bar-fill mode or a
// per-campsite status string for the red/green mode. All weekday/grid math lives here so
// it's unit-testable independent of React.

export const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Fraction of a campground-night still open: available / total. `total` includes "other"
// (not-yet-released / not-reservable), so this is the share of the whole inventory that is
// actually bookable right now. 0 when nothing was captured.
export function availFraction({ available = 0, total = 0 } = {}) {
  return total > 0 ? available / total : 0;
}

// nights ([{ night, available, reserved, total }]) → { 'YYYY-MM-DD': {available,reserved,total} }.
export function nightsToValues(nights = []) {
  const out = {};
  for (const n of nights) {
    if (n && n.night) out[n.night] = { available: n.available ?? 0, reserved: n.reserved ?? 0, total: n.total ?? 0 };
  }
  return out;
}

// Collapse a campground's per-site calendars into a per-night availability rollup, so a
// whole campground reads as one bar-fill calendar (the "total availability for all sites").
// series: [{ by_date: { 'YYYY-MM-DD': 'available'|'reserved'|'other' } }].
export function aggregateSeries(series = []) {
  const out = {};
  for (const site of series) {
    const byDate = site?.by_date || {};
    for (const [date, status] of Object.entries(byDate)) {
      const cell = out[date] || (out[date] = { available: 0, reserved: 0, total: 0 });
      cell.total += 1;
      if (status === 'available') cell.available += 1;
      else if (status === 'reserved') cell.reserved += 1;
    }
  }
  return out;
}

// Build full month grids from a date→value map. Every day of each month that appears in
// the data is rendered (weekday-aligned, leading/trailing blanks padded), so a partial
// capture window still reads as a real calendar. Days with no captured value carry
// `value: undefined` (rendered as out-of-window). Returns:
//   [{ key:'YYYY-MM', label:'Jul 2026', weeks: [[cell|null × 7], …] }]
// where a cell is { date:'YYYY-MM-DD', day:Number, value:any }.
export function monthGrid(values = {}) {
  const dates = Object.keys(values).sort();
  if (dates.length === 0) return [];
  const monthKeys = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();

  return monthKeys.map((key) => {
    const year = Number(key.slice(0, 4));
    const mon = Number(key.slice(5, 7)); // 1-based
    const daysInMonth = new Date(year, mon, 0).getDate();
    const firstDow = new Date(year, mon - 1, 1).getDay(); // 0=Sun

    const cells = [];
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${key}-${String(day).padStart(2, '0')}`;
      cells.push({ date, day, value: values[date] });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { key, label: `${MONTHS[mon]} ${year}`, weeks };
  });
}
