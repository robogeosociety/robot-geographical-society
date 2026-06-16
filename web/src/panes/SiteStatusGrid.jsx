// Per-location view: the campsite status grid for the selected night, derived from
// each campsite's captured calendar (by_date[date]). A view in the LocationPanes
// registry — receives the already-filtered campsite series + the selected night.
export default function SiteStatusGrid({ sites, date, onSelectSite }) {
  if (sites.length === 0) return <div className="muted pane-empty">no campsites match</div>;
  return (
    <div className="site-grid">
      {sites.map((s) => {
        const status = s.by_date?.[date] ?? 'other';
        return (
          <button key={s.siteId}
            className={`site-cell site-${status}`}
            title={`${s.loop || ''} · ${s.type || ''} · ${status}`}
            onClick={() => onSelectSite(s.siteId)}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
