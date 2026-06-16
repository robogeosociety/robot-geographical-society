// One site's availability across the captured window. `byDate` is
// { 'YYYY-MM-DD': 'available' | 'reserved' | 'other' }. Cells are grouped by month
// with a label, colored by status; hover shows the exact date + status.
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function SiteCalendar({ byDate }) {
  const dates = Object.keys(byDate || {}).sort();
  if (dates.length === 0) return <div className="muted">no capture window for this site</div>;

  const months = [];
  let current = null;
  for (const d of dates) {
    const m = d.slice(0, 7); // YYYY-MM
    if (!current || current.key !== m) {
      current = { key: m, label: `${MONTHS[Number(d.slice(5, 7))]} ${d.slice(0, 4)}`, days: [] };
      months.push(current);
    }
    current.days.push(d);
  }

  return (
    <div className="calendar" aria-label="Site availability calendar">
      <div className="cal-legend">
        <span><i className="dot cal-available" /> available</span>
        <span><i className="dot cal-reserved" /> reserved</span>
        <span><i className="dot cal-other" /> other</span>
      </div>
      {months.map((mo) => (
        <div key={mo.key} className="cal-month">
          <div className="cal-month-label">{mo.label}</div>
          <div className="cal-strip">
            {mo.days.map((d) => (
              <span key={d}
                className={`cal-cell cal-${byDate[d]}`}
                title={`${d} · ${byDate[d]}`}>
                {Number(d.slice(8, 10))}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
