import { useEffect, useMemo, useState } from 'react';
import { useMap } from '../map/MapContext';
import { useCampgroundPies } from '../map/useCampgroundPies';
import { getAvailability, getSiteCalendar } from '../api';
import { AGENCY_COLORS, agencyShort, SEASONS } from '../constants';
import AgencyLegend from '../components/AgencyLegend';
import SeasonLegend from '../components/SeasonLegend';
import StalenessBanner from '../components/StalenessBanner';
import SiteCalendar from '../components/SiteCalendar';
import LocationPanes from '../panes/LocationPanes';

// "Today" — the window of remaining availability is summed on/after this night.
const TODAY = new Date().toISOString().slice(0, 10);

export default function AvailabilityView() {
  const { map, ready } = useMap();
  // Each campground is a seasonal-availability pie (total remaining for the year,
  // sliced by season). The season selector highlights one season's slice.
  const [season, setSeason] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // a campground row

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    getAvailability(TODAY)
      .then((data) => { if (live) setRows(data); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const onSelect = (row) => {
    setSelected(row);
    if (map) map.flyTo({ center: [row.lng, row.lat], zoom: Math.max(map.getZoom(), 9) });
  };

  useCampgroundPies({
    map, ready, rows, highlightSeason: season,
    onSelect, onEmpty: () => setSelected(null),
  });

  const stalest = useMemo(
    () => rows.reduce((min, r) => (r.collected_date && (!min || r.collected_date < min) ? r.collected_date : min), null),
    [rows],
  );

  return (
    <>
      <div className="controls controls-left">
        <label className="season-filter">
          <span>Season</span>
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            <option value="all">all seasons</option>
            {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {loading && <span className="muted">loading…</span>}
        {error && <span className="error-text" role="alert">{error}</span>}
        {!loading && !error && <span className="muted">{rows.length} campgrounds</span>}
      </div>

      <StalenessBanner date={stalest} />
      <SeasonLegend highlight={season} />
      <AgencyLegend />

      {selected && (
        <CampgroundPanel
          guid={selected.guid}
          campground={selected}
          date={TODAY}
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
  const [siteId, setSiteId] = useState(null); // a selected individual campsite

  // Reset the drill-down when the campground or night changes.
  useEffect(() => { setSiteId(null); }, [guid, date]);

  const available = campground.available ?? 0;
  const reserved = campground.reserved ?? 0;
  const total = campground.total ?? 0;
  const ratio = total > 0 ? available / total : 0;

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
        <span className="muted">{reserved} reserved · {total} campsites</span>
        <div className="muted small">night of {date}
          {campground.collected_date && campground.collected_date !== date
            ? ` · captured ${campground.collected_date}` : ''}
        </div>
      </div>

      {siteId ? (
        <SiteDetail guid={guid} siteId={siteId} onBack={() => setSiteId(null)} />
      ) : (
        <LocationPanes guid={guid} date={date} onSelectSite={setSiteId} />
      )}
    </div>
  );
}

// Drill-down for one campsite: its full captured calendar. The per-campsite endpoint
// returns the label/loop/type/use alongside by_date, so no roster prop is needed.
function SiteDetail({ guid, siteId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    getSiteCalendar(guid, siteId)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [guid, siteId]);

  return (
    <div className="site-detail">
      <button className="link-back" onClick={onBack}>← all campsites</button>
      <h3 className="site-detail-title">
        Campsite #{data?.label ?? siteId}
        {data?.loop ? <span className="muted small"> · {data.loop}</span> : null}
      </h3>
      {data?.type && <div className="muted small">{data.type} · {data.use}</div>}
      {error && <div className="error-text" role="alert">{error}</div>}
      {data?.by_date && <SiteCalendar byDate={data.by_date} />}
    </div>
  );
}
