import { aggregateBuckets } from '../panes/buckets';

// The campground's overall availability by season — every campsite's available nights
// summed per season, shown as a labeled bar (solid = available, faint = captured).
// Sits at the top of the campground panel in the map view.
export default function CampgroundSeasonBar({ sites, from }) {
  const seasons = aggregateBuckets(sites, 'season', { from });
  if (seasons.length === 0) return null;

  const width = 320;
  const height = 44;
  const labelH = 13;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - labelH - pad;
  const maxTotal = Math.max(1, ...seasons.map((b) => b.total));
  const n = seasons.length;
  const slot = w / n;

  return (
    <div className="season-bar" aria-label="campground availability by season">
      <div className="muted small season-bar-title">availability by season</div>
      <svg width={width} height={height} role="img"
        aria-label={seasons.map((b) => `${b.label} ${b.available} of ${b.total}`).join(', ')}>
        {seasons.map((b, i) => {
          const x = pad + i * slot;
          const fullH = (b.total / maxTotal) * h;
          const availH = (b.available / maxTotal) * h;
          const bw = slot - 6;
          return (
            <g key={b.key}>
              <rect x={x + 3} y={pad + h - fullH} width={bw} height={fullH} fill="rgba(255,255,255,0.06)" rx="2" />
              <rect x={x + 3} y={pad + h - availH} width={bw} height={availH} fill="#A6E22E" rx="2">
                <title>{`${b.label}: ${b.available}/${b.total} campsite-nights open`}</title>
              </rect>
              <text x={x + slot / 2} y={height - 2} textAnchor="middle" className="season-bar-label">{b.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
