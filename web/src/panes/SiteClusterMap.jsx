import { useMemo } from 'react';
import { computeRunway } from './runway';

// Per-location view: a zoomed layout of every campsite, grouped into clusters by loop
// (an approximation — campsites have no real coordinates yet). Each campsite is an
// availability bar: a bottom-anchored fill = available nights remaining, colored
// open→full. Clicking a campsite drills into its calendar.
function ratioColor(r) {
  if (r >= 0.6) return '#3FB950';
  if (r >= 0.25) return '#D29922';
  if (r > 0) return '#E0843B';
  return '#F85149';
}

export default function SiteClusterMap({ sites, date, onSelectSite }) {
  const { clusters, maxNights } = useMemo(() => {
    const byLoop = new Map();
    let maxNights = 1;
    for (const s of sites) {
      const r = computeRunway(s.by_date, { from: date });
      maxNights = Math.max(maxNights, r.availableNights, 1);
      const loop = s.loop || '—';
      if (!byLoop.has(loop)) byLoop.set(loop, []);
      byLoop.get(loop).push({ site: s, nights: r.availableNights, total: r.n });
    }
    const clusters = [...byLoop.entries()]
      .map(([loop, cells]) => ({
        loop,
        cells: cells.sort((a, b) => Number(a.site.label) - Number(b.site.label) || 0),
      }))
      .sort((a, b) => a.loop.localeCompare(b.loop));
    return { clusters, maxNights };
  }, [sites, date]);

  if (sites.length === 0) return <div className="muted pane-empty">no campsites match</div>;

  return (
    <div className="cluster-map">
      <div className="muted small cluster-note">
        approximate layout — clustered by loop (no per-campsite coordinates yet)
      </div>
      {clusters.map(({ loop, cells }) => (
        <div key={loop} className="cluster">
          <div className="cluster-label muted small">{loop} · {cells.length}</div>
          <div className="cluster-cells">
            {cells.map(({ site, nights, total }) => {
              const ratio = total > 0 ? nights / total : 0;
              return (
                <button key={site.siteId} className="cluster-cell"
                  title={`#${site.label} · ${nights}/${total} nights open`}
                  onClick={() => onSelectSite(site.siteId)}>
                  <span className="cluster-bar-track">
                    <span className="cluster-bar"
                      style={{ height: `${Math.round((nights / maxNights) * 100)}%`, background: ratioColor(ratio) }} />
                  </span>
                  <span className="cluster-cell-label">{site.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
