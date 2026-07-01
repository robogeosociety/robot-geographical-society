import React from 'react';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Build month grids from a date→value map. Each cell carries { date, day, value }.
function buildMonths(data) {
  const dates = Object.keys(data || {}).sort();
  if (!dates.length) return [];
  const byMonth = new Map();
  for (const d of dates) {
    const key = d.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(d);
  }
  const months = [];
  for (const [key, days] of byMonth) {
    const [y, m] = key.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const cells = [];
    for (let i = 0; i < first; i += 1) cells.push(null);
    for (const d of days) {
      cells.push({ date: d, day: Number(d.slice(8, 10)), value: data[d] });
    }
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    months.push({ key, label: `${MONTHS[m]} ${y}`, weeks });
  }
  return months;
}

function availabilityColor(t) {
  if (t >= 0.6) return 'var(--avail-high)';
  if (t >= 0.25) return 'var(--avail-mid)';
  if (t > 0) return 'var(--avail-low)';
  return 'var(--avail-none)';
}

const STATUS_COLOR = {
  available: 'var(--avail-high)',
  reserved: 'var(--avail-none)',
  other: 'var(--state-disabled)',
};

/**
 * FillCalendar — the frosted month-grid that answers "how does the season fill
 * up, day by day?". Two modes:
 *   mode="fill"   — each day filled top→bottom by the share of sites still open
 *                   that night ({ available, total } values). Green = wide open.
 *   mode="status" — each day solid red/green for one campsite's per-night status
 *                   ('available' | 'reserved' | 'other').
 */
export function FillCalendar({ data, months: monthsProp, mode = 'fill' }) {
  const months = monthsProp || buildMonths(data);
  if (!months.length) return <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>no capture window</div>;

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
        {mode === 'status' ? (
          <>
            <LegendDot color={STATUS_COLOR.available} label="available" />
            <LegendDot color={STATUS_COLOR.reserved} label="reserved" />
            <LegendDot color={STATUS_COLOR.other} label="other" />
          </>
        ) : (
          <>
            <LegendDot color={availabilityColor(1)} label="mostly open" />
            <LegendDot color={availabilityColor(0.4)} label="filling" />
            <LegendDot color={availabilityColor(0)} label="mostly booked" />
          </>
        )}
      </div>

      {months.map((mo) => (
        <div key={mo.key} style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginBottom: 5 }}>{mo.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
            {WEEKDAYS.map((d, i) => (
              <span key={i} style={{ textAlign: 'center', fontSize: 9, color: 'var(--text-faint)' }}>{d}</span>
            ))}
          </div>
          {mo.weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
              {week.map((cell, ci) => <Cell key={ci} cell={cell} mode={mode} />)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <i style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} />{label}
    </span>
  );
}

function Cell({ cell, mode }) {
  const baseCell = {
    position: 'relative',
    aspectRatio: '1',
    borderRadius: 'var(--radius-xs)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontSize: 9,
  };
  if (!cell) return <span style={{ ...baseCell, background: 'none' }} aria-hidden="true" />;
  const dayStyle = { position: 'relative', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', textShadow: '0 1px 1px rgba(0,0,0,0.55)' };

  if (mode === 'status') {
    const status = cell.value;
    if (!status) return <span style={{ ...baseCell, background: 'rgba(255,255,255,0.04)' }} title={`${cell.date} · no capture`}><span style={{ ...dayStyle, color: 'var(--text-faint)' }}>{cell.day}</span></span>;
    return (
      <span style={{ ...baseCell, background: STATUS_COLOR[status] || STATUS_COLOR.other }} title={`${cell.date} · ${status}`}>
        <span style={{ ...dayStyle, color: status === 'available' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)' }}>{cell.day}</span>
      </span>
    );
  }

  const v = cell.value;
  if (!v || !v.total) return <span style={{ ...baseCell, background: 'rgba(255,255,255,0.04)' }} title={`${cell.date} · no capture`}><span style={{ ...dayStyle, color: 'var(--text-faint)' }}>{cell.day}</span></span>;
  const frac = v.available / v.total;
  return (
    <span style={{ ...baseCell, background: 'rgba(255,255,255,0.05)' }} title={`${cell.date} · ${v.available}/${v.total} open · ${Math.round(frac * 100)}%`}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${frac * 100}%`, background: availabilityColor(frac) }} />
      <span style={dayStyle}>{cell.day}</span>
    </span>
  );
}
