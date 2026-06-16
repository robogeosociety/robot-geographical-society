import { useMemo, useState } from 'react';
import AvailabilityBars from '../components/AvailabilityBars';
import { bucketAvailability } from './buckets';

const GRANULARITIES = ['day', 'week', 'month', 'season'];

// Per-location view: remaining-availability bar graphs per campsite, bucketed by
// day / week / month / season (toggle shared across rows). A view in the LocationPanes
// registry — receives the already-filtered campsite series + the selected night.
export default function SiteAvailabilityBars({ sites, date, onSelectSite }) {
  const [gran, setGran] = useState('week');

  const rows = useMemo(
    () => sites.map((s) => ({ site: s, buckets: bucketAvailability(s.by_date, gran, { from: date }) })),
    [sites, gran, date],
  );

  if (sites.length === 0) return <div className="muted pane-empty">no campsites match</div>;

  return (
    <div className="bars-view">
      <div className="gran-toggle" role="tablist" aria-label="bucket granularity">
        {GRANULARITIES.map((g) => (
          <button key={g} role="tab" aria-selected={g === gran}
            className={`chip ${g === gran ? 'chip-on' : ''}`}
            onClick={() => setGran(g)}>{g}</button>
        ))}
      </div>
      <ul className="survival-list">
        {rows.map(({ site, buckets }) => {
          const open = buckets.reduce((a, b) => a + b.available, 0);
          return (
            <li key={site.siteId}>
              <button className="survival-row" onClick={() => onSelectSite(site.siteId)}>
                <div className="survival-meta">
                  <span className="survival-label">#{site.label}</span>
                  {site.loop && <span className="muted small survival-loop">{site.loop}</span>}
                </div>
                <AvailabilityBars buckets={buckets} />
                <div className="survival-stats">
                  <span><strong>{open}</strong> nights</span>
                  <span className="muted small">{buckets.length} {gran}{buckets.length === 1 ? '' : 's'}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
