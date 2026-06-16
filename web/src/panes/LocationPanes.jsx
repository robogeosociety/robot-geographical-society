import { useEffect, useMemo, useRef, useState } from 'react';
import { getCampgroundSeries } from '../api';
import SiteSurvivalList from './SiteSurvivalList';
import SiteAvailabilityBars from './SiteAvailabilityBars';
import SiteClusterMap from './SiteClusterMap';
import SiteStatusGrid from './SiteStatusGrid';

// Registry of per-location (per-campground) data views. Add an entry to add a
// swipeable pane — e.g. a model-predicted survival curve once predict/ readiness
// clears, a price/amenity view. Each Component receives
// { sites, date, onSelectSite } where `sites` is the filtered campsite series.
export const VIEWS = [
  { key: 'survival', label: 'Survival', Component: SiteSurvivalList },
  { key: 'bars', label: 'Availability', Component: SiteAvailabilityBars },
  { key: 'layout', label: 'Layout', Component: SiteClusterMap },
  { key: 'status', label: 'Status', Component: SiteStatusGrid },
];

const STATUSES = ['all', 'available', 'reserved', 'other'];

// Swipeable container of per-location views with a shared filter bar. Fetches the
// campsite series once (each campsite's full by_date) and feeds every view from it.
export default function LocationPanes({ guid, date, onSelectSite }) {
  const [sites, setSites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState(0);

  // Per-location filters (extensible: add a key here + a control below).
  const [search, setSearch] = useState('');
  const [loop, setLoop] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null); setSites(null);
    getCampgroundSeries(guid, date)
      .then((data) => { if (live) setSites(data); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [guid, date]);

  const loops = useMemo(() => {
    const set = new Set((sites || []).map((s) => s.loop).filter(Boolean));
    return [...set].sort();
  }, [sites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (sites || []).filter((s) => {
      if (loop !== 'all' && s.loop !== loop) return false;
      if (status !== 'all' && (s.by_date?.[date] ?? 'other') !== status) return false;
      if (q && !String(s.label).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sites, search, loop, status, date]);

  // Touch swipe between views.
  const startX = useRef(null);
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (dx < -40 && view < VIEWS.length - 1) setView(view + 1);
    if (dx > 40 && view > 0) setView(view - 1);
    startX.current = null;
  };

  return (
    <div className="location-panes">
      <div className="pane-tabs" role="tablist">
        {VIEWS.map((v, i) => (
          <button key={v.key} role="tab" aria-selected={i === view}
            className={`pane-tab ${i === view ? 'pane-tab-on' : ''}`}
            onClick={() => setView(i)}>{v.label}</button>
        ))}
      </div>

      <div className="pane-filters">
        <input className="pane-search" type="search" placeholder="site #"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        {loops.length > 1 && (
          <select className="pane-select" value={loop} onChange={(e) => setLoop(e.target.value)}>
            <option value="all">all loops</option>
            {loops.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <select className="pane-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading && <div className="loading-indicator">Loading campsites…</div>}
      {error && <div className="error-text" role="alert">{error}</div>}

      {!loading && !error && sites && (
        <div className="pane-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="pane-track" style={{ transform: `translateX(-${view * 100}%)` }}>
            {VIEWS.map(({ key, Component }) => (
              <div key={key} className="pane" aria-hidden={VIEWS[view].key !== key}>
                <Component sites={filtered} date={date} onSelectSite={onSelectSite} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
