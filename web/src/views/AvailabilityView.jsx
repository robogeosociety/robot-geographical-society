import { useEffect, useMemo, useState } from 'react';
import { useMap } from '../map/MapContext';
import { useCircleLayer, rowsToFC, HOVER_PAINT } from '../map/useCircleLayer';
import { getAvailability, getCampgroundSites, getSiteCalendar } from '../api';
import { AGENCY_COLORS, agencyShort } from '../constants';
import AgencyLegend from '../components/AgencyLegend';
import StalenessBanner from '../components/StalenessBanner';
import SiteCalendar from '../components/SiteCalendar';

const TODAY = '2026-06-08';

// Pin color runs full (red) → open (green) on the available/total ratio.
const AVAILABILITY_PAINT = {
  ...HOVER_PAINT,
  'circle-color': [
    'interpolate', ['linear'], ['get', 'ratio'],
    0, '#F85149',
    0.25, '#D29922',
    0.6, '#A6E22E',
    1, '#3FB950',
  ],
};

export default function AvailabilityView() {
  const { map, ready } = useMap();
  const [date, setDate] = useState(TODAY);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // a feature's properties

  // Fetch the night's availability whenever the date changes.
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    getAvailability(date)
      .then((data) => { if (live) setRows(data); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [date]);

  const fc = useMemo(
    () => rowsToFC(rows, (r) => ({
      ratio: r.total > 0 ? r.available / r.total : 0,
      agency_short: agencyShort(r.agency),
    })),
    [rows],
  );

  useCircleLayer({
    map, ready, id: 'availability', features: fc, paint: AVAILABILITY_PAINT,
    onSelect: (props) => {
      setSelected(props);
      if (map) map.flyTo({ center: [props.lng, props.lat], zoom: Math.max(map.getZoom(), 9) });
    },
    onEmptyClick: () => setSelected(null),
  });

  const stalest = useMemo(
    () => rows.reduce((min, r) => (r.collected_date && (!min || r.collected_date < min) ? r.collected_date : min), null),
    [rows],
  );

  return (
    <>
      <div className="controls controls-left">
        <label className="date-filter">
          <span>Night of</span>
          <input type="date" value={date} max="2026-12-31" min="2026-01-01"
            onChange={(e) => setDate(e.target.value)} />
        </label>
        {loading && <span className="muted">loading…</span>}
        {error && <span className="error-text" role="alert">{error}</span>}
        {!loading && !error && <span className="muted">{rows.length} campgrounds</span>}
      </div>

      <StalenessBanner date={stalest} />
      <AgencyLegend />

      {selected && (
        <CampgroundPanel
          guid={selected.guid}
          campground={selected}
          date={date}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function ratioColor(ratio) {
  if (ratio >= 0.6) return '#3FB950';
  if (ratio >= 0.25) return '#D29922';
  return '#F85149';
}

export function CampgroundPanel({ guid, campground, date, onClose }) {
  const [sites, setSites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [siteId, setSiteId] = useState(null); // a selected individual site

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setSiteId(null);
    getCampgroundSites(guid, date)
      .then((data) => { if (live) setSites(data.sites || []); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [guid, date]);

  const available = campground.available ?? 0;
  const reserved = campground.reserved ?? 0;
  const total = campground.total ?? 0;
  const ratio = total > 0 ? available / total : 0;

  const shown = (sites || []).filter((s) => statusFilter === 'all' || s.status === statusFilter);

  return (
    <div className="detail-panel" role="dialog" aria-label="Campground availability">
      <button className="panel-close" onClick={onClose} aria-label="Close panel">✕</button>

      <div className="panel-agency" style={{ color: AGENCY_COLORS[agencyShort(campground.agency)] }}>
        {campground.agency}
      </div>
      <h2 className="panel-name">{campground.name}</h2>

      <div className="avail-summary">
        <span className="avail-pill" style={{ background: ratioColor(ratio) }}>
          {available} open
        </span>
        <span className="muted">{reserved} reserved · {total} sites</span>
        <div className="muted small">night of {date}
          {campground.collected_date && campground.collected_date !== date
            ? ` · captured ${campground.collected_date}` : ''}
        </div>
      </div>

      {siteId ? (
        <SiteDetail guid={guid} siteId={siteId}
          site={(sites || []).find((s) => s.siteId === siteId)}
          onBack={() => setSiteId(null)} />
      ) : (
        <>
          <div className="site-filters">
            {['all', 'available', 'reserved', 'other'].map((f) => (
              <button key={f}
                className={`chip ${statusFilter === f ? 'chip-on' : ''}`}
                onClick={() => setStatusFilter(f)}>{f}</button>
            ))}
          </div>

          {loading && <div className="loading-indicator">Loading sites…</div>}
          {error && <div className="error-text" role="alert">{error}</div>}
          {!loading && !error && (
            <div className="site-grid">
              {shown.map((s) => (
                <button key={s.siteId}
                  className={`site-cell site-${s.status}`}
                  title={`${s.loop || ''} · ${s.type || ''} · ${s.status}`}
                  onClick={() => setSiteId(s.siteId)}>
                  {s.label}
                </button>
              ))}
              {shown.length === 0 && <div className="muted">no sites match</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SiteDetail({ guid, siteId, site, onBack }) {
  const [byDate, setByDate] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setByDate(null);
    setError(null);
    getSiteCalendar(guid, siteId)
      .then((data) => { if (live) setByDate(data.by_date || {}); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [guid, siteId]);

  return (
    <div className="site-detail">
      <button className="link-back" onClick={onBack}>← all sites</button>
      <h3 className="site-detail-title">
        Site {site?.label ?? siteId}
        {site?.loop ? <span className="muted small"> · {site.loop}</span> : null}
      </h3>
      {site?.type && <div className="muted small">{site.type} · {site.use}</div>}
      {error && <div className="error-text" role="alert">{error}</div>}
      {byDate && <SiteCalendar byDate={byDate} />}
    </div>
  );
}
