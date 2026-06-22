// A standard month-grid calendar with two day-cell renderers:
//   mode="fill"   — each day is a bar-graph square filled top→bottom by the share of all
//                   sites still open that night (green = wide open, red = mostly booked).
//                   Used for the all-campgrounds default and the rest-of-season view.
//   mode="status" — each day is solid red/green for a single campsite's per-night status
//                   (available / reserved / other).
// Grid math (weekday alignment, month splitting) is in panes/calendar.js.
import { WEEKDAYS } from '../panes/calendar';
import { availabilityColor } from '../constants';

const pct = (x) => `${Math.round(x * 100)}%`;

function FillCell({ cell }) {
  if (!cell) return <span className="calx-cell calx-pad" aria-hidden="true" />;
  const v = cell.value;
  if (!v || !v.total) {
    return <span className="calx-cell calx-empty" title={`${cell.date} · no capture`}>{cell.day}</span>;
  }
  const frac = v.available / v.total;
  const title = `${cell.date} · ${v.available}/${v.total} open · ${pct(frac)}`;
  return (
    <span className="calx-cell" title={title}>
      {/* Fill hangs from the top; its height is the open share, so a full square = wide
          open and it drains downward as the night books up. */}
      <span className="calx-fill" style={{ height: pct(frac), background: availabilityColor(frac) }} />
      <span className="calx-day">{cell.day}</span>
    </span>
  );
}

function StatusCell({ cell }) {
  if (!cell) return <span className="calx-cell calx-pad" aria-hidden="true" />;
  const status = cell.value;
  if (!status) {
    return <span className="calx-cell calx-empty" title={`${cell.date} · no capture`}>{cell.day}</span>;
  }
  return (
    <span className={`calx-cell calx-solid cal-${status}`} title={`${cell.date} · ${status}`}>
      <span className="calx-day">{cell.day}</span>
    </span>
  );
}

export default function AvailabilityCalendar({ months, mode = 'fill' }) {
  if (!months || months.length === 0) {
    return <div className="muted">no capture window</div>;
  }
  const Cell = mode === 'status' ? StatusCell : FillCell;

  return (
    <div className="calx" aria-label="Availability calendar">
      <div className="calx-legend">
        {mode === 'status' ? (
          <>
            <span><i className="dot cal-available" /> available</span>
            <span><i className="dot cal-reserved" /> reserved</span>
            <span><i className="dot cal-other" /> other</span>
          </>
        ) : (
          <>
            <span><i className="dot" style={{ background: availabilityColor(1) }} /> mostly open</span>
            <span><i className="dot" style={{ background: availabilityColor(0.4) }} /> filling</span>
            <span><i className="dot" style={{ background: availabilityColor(0) }} /> mostly booked</span>
            <span className="muted">· bar height = share of sites open</span>
          </>
        )}
      </div>

      {months.map((mo) => (
        <div key={mo.key} className="calx-month">
          <div className="calx-month-label">{mo.label}</div>
          <div className="calx-dow">
            {WEEKDAYS.map((d, i) => <span key={i} className="calx-dow-cell">{d}</span>)}
          </div>
          {mo.weeks.map((week, wi) => (
            <div key={wi} className="calx-week">
              {week.map((cell, ci) => <Cell key={ci} cell={cell} />)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
