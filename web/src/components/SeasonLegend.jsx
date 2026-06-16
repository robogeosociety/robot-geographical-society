import { SEASONS, SEASON_COLORS } from '../constants';

// Color key for the per-campground availability pies. The selected season stays vivid;
// the others dim — mirroring the pie slice highlight.
export default function SeasonLegend({ highlight = 'all' }) {
  return (
    <div className="legend season-legend" aria-label="season legend">
      {SEASONS.map((s) => (
        <span key={s} className="legend-item"
          style={{ opacity: highlight === 'all' || highlight === s ? 1 : 0.4 }}>
          <span className="legend-dot" style={{ backgroundColor: SEASON_COLORS[s] }} />
          {s}
        </span>
      ))}
    </div>
  );
}
