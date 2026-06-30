import React from 'react';

function fillColor(t) {
  if (t >= 0.66) return 'var(--avail-none)';
  if (t >= 0.33) return 'var(--avail-mid)';
  return 'var(--avail-high)';
}

/**
 * FillCurve — a glowing line chart on glass: % booked over the life of a watch.
 * x = observation order, y = % booked (0% at the bottom). Renders a soft area
 * fill under a 1.5px line, colored by the latest fill.
 */
export function FillCurve({ points = [], fill, width = 240, height = 64, pad = 3 }) {
  const series = points.length
    ? points.map((p) => (p.total ? p.reserved / p.total : (typeof p === 'number' ? p : 0)))
    : [0, fill ?? 0];
  const latest = fill != null ? fill : series[series.length - 1] ?? 0;
  const color = fillColor(latest);

  const n = series.length;
  const x = (i) => pad + (n <= 1 ? 0 : (i / (n - 1)) * (width - pad * 2));
  const y = (v) => height - pad - Math.max(0, Math.min(1, v)) * (height - pad * 2);

  const line = series.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${x(n - 1)},${height - pad}`;
  const id = React.useId();

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img"
      aria-label={`${Math.round(latest * 100)}% booked`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#g-${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
}
