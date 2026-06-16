import { computeRunway } from '../panes/runway';

// A small SVG survival sparkline for one campsite's availability runway.
//   x = nights ahead across the booking horizon
//   y = available nights remaining from that point (observed, non-increasing)
//   marker = observed exhaustion (the last available night)
export default function SurvivalSparkline({ byDate, from, width = 168, height = 38 }) {
  const { remaining, n, exhaustionIndex, availableNights } = computeRunway(byDate, { from });

  if (n === 0 || availableNights === 0) {
    return <svg className="sparkline" width={width} height={height} role="img"
      aria-label="no availability"><line x1="0" y1={height - 1} x2={width} y2={height - 1}
        stroke="#6E7681" strokeWidth="1" /></svg>;
  }

  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const max = remaining[0] || 1;
  const x = (i) => pad + (n === 1 ? 0 : (i / (n - 1)) * w);
  const y = (v) => pad + h - (v / max) * h;

  const line = remaining.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${pad},${pad + h} ${line} ${x(n - 1).toFixed(1)},${pad + h}`;

  return (
    <svg className="sparkline" width={width} height={height} role="img"
      aria-label={`${availableNights} available nights, runs out at horizon ${exhaustionIndex + 1} of ${n}`}>
      <polygon points={area} fill="rgba(166,226,46,0.12)" />
      <polyline points={line} fill="none" stroke="#A6E22E" strokeWidth="1.5" />
      {exhaustionIndex >= 0 && (
        <line x1={x(exhaustionIndex).toFixed(1)} y1={pad} x2={x(exhaustionIndex).toFixed(1)} y2={pad + h}
          stroke="#F85149" strokeWidth="1" strokeDasharray="2 2" />
      )}
    </svg>
  );
}
