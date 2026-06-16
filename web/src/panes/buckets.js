// Aggregate a campsite's captured calendar into availability buckets at a chosen
// granularity. Each bucket: { key, label, available, total } where `available` is the
// count of available nights and `total` the captured nights in that period.
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function seasonOf(month) {
  if (month === 12 || month <= 2) return 'Winter';
  if (month <= 5) return 'Spring';
  if (month <= 8) return 'Summer';
  return 'Fall';
}

const pad2 = (n) => String(n).padStart(2, '0');

// Build a timezone-safe local-date key from y/m/d numbers.
function ymd(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function bucketAvailability(byDate, granularity, { from } = {}) {
  const all = Object.keys(byDate || {}).sort();
  const dates = from ? all.filter((d) => d >= from) : all;
  const buckets = new Map();

  for (const d of dates) {
    const [y, mo, da] = d.split('-').map(Number);
    let key;
    let label;

    if (granularity === 'day') {
      key = d;
      label = `${mo}/${da}`;
    } else if (granularity === 'week') {
      const off = (new Date(y, mo - 1, da).getDay() + 6) % 7; // Monday-start
      key = ymd(y, mo, da - off);
      const [, wm, wd] = key.split('-');
      label = `${Number(wm)}/${Number(wd)}`;
    } else if (granularity === 'month') {
      key = `${y}-${pad2(mo)}`;
      label = MONTHS[mo];
    } else { // season — December rolls into the following year's winter
      const sy = mo === 12 ? y + 1 : y;
      key = `${sy}-${seasonOf(mo)}`;
      label = seasonOf(mo);
    }

    let b = buckets.get(key);
    if (!b) { b = { key, label, available: 0, total: 0 }; buckets.set(key, b); }
    b.total += 1;
    if (byDate[d] === 'available') b.available += 1;
  }

  return [...buckets.values()];
}
