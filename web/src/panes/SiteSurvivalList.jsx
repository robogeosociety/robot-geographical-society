import { useMemo } from 'react';
import SurvivalSparkline from '../components/SurvivalSparkline';
import { computeRunway } from './runway';

// Per-location view: a list of campsites, each with an availability-runway sparkline.
// y = available nights remaining, x = nights ahead toward observed exhaustion.
// Scarcest sites (soonest to run out) sort first. A view in the LocationPanes registry,
// so it receives the already-filtered campsite series + the selected night.
export default function SiteSurvivalList({ sites, date, onSelectSite }) {
  const rows = useMemo(() => {
    return sites
      .map((s) => ({ site: s, runway: computeRunway(s.by_date, { from: date }) }))
      .sort((a, b) => a.runway.availableNights - b.runway.availableNights);
  }, [sites, date]);

  if (rows.length === 0) return <div className="muted pane-empty">no campsites match</div>;

  return (
    <ul className="survival-list">
      {rows.map(({ site, runway }) => (
        <li key={site.siteId}>
          <button className="survival-row" onClick={() => onSelectSite(site.siteId)}>
            <div className="survival-meta">
              <span className="survival-label">#{site.label}</span>
              {site.loop && <span className="muted small survival-loop">{site.loop}</span>}
            </div>
            <SurvivalSparkline byDate={site.by_date} from={date} />
            <div className="survival-stats">
              <span><strong>{runway.availableNights}</strong> nights</span>
              <span className="muted small">
                {runway.exhaustionDate ? `runs out ${runway.exhaustionDate.slice(5)}` : 'none open'}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
