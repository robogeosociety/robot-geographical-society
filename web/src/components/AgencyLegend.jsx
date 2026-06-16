import { AGENCY_COLORS, AGENCY_LABELS } from '../constants';

// Static agency color key, shared by both views.
export default function AgencyLegend() {
  return (
    <div className="legend" aria-label="Agency legend">
      {Object.entries(AGENCY_LABELS).map(([key, label]) => (
        <span key={key} className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: AGENCY_COLORS[key] }} />
          {label}
        </span>
      ))}
    </div>
  );
}
