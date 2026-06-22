import { useEffect, useMemo, useState } from 'react';
import { useMap } from '../map/MapContext';
import { getDemand, getCampgroundSites, getCampgroundSeries, getSiteCalendar } from '../api';
import { nightsToValues, aggregateSeries, monthGrid } from '../panes/calendar';
import StalenessBanner from '../components/StalenessBanner';
import ProgressBar from '../components/ProgressBar';
import AvailabilityCalendar from '../components/AvailabilityCalendar';

// The Calendar view answers "how does the season fill up, day by day?" — the temporal
// sibling of Availability (one night, on the map) and Demand (rankings). By default it
// rolls every collected campground into one bar-graph calendar: each day square is filled
// top→bottom by the share of all sites still open that night, across the rest of the
// season. Drill into a campground for its own bar-fill calendar, or a single campsite for
// a red/green per-night calendar.
const TODAY = new Date().toISOString().slice(0, 10);

export default function CalendarView() {
  const { map } = useMap();
  const [demand, setDemand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [guid, setGuid] = useState('');   // '' = all campgrounds
  const [siteId, setSiteId] = useState(''); // '' = whole campground (aggregate)

  useEffect(() => {
    let live = true;
    getDemand()
      .then((d) => { if (live) setDemand(d); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const campgrounds = useMemo(
    () => [...(demand?.campgrounds ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [demand],
  );
  const firstNight = demand?.from || demand?.nights?.[0]?.night || TODAY;

  // Reset the campsite drill-down and fly to the campground when the scope changes.
  const onPickCampground = (g) => {
    setGuid(g);
    setSiteId('');
    const cg = campgrounds.find((c) => c.guid === g);
    if (map && cg && Number.isFinite(cg.lat) && Number.isFinite(cg.lng)) {
      map.flyTo({ center: [cg.lng, cg.lat], zoom: Math.max(map.getZoom(), 9) });
    }
  };

  return (
    <>
      <div className="map-overlay-tl">
        <div className="control-row">
          {error && <span className="error-text control-chip" role="alert">{error}</span>}
          {loading && (
            <span className="control-chip control-chip--progress">
              <ProgressBar indeterminate label="Loading calendar" />
              <span className="muted">loading calendar…</span>
            </span>
          )}
          {!loading && !error && (
            <span className="muted control-chip">season fill calendar · {campgrounds.length} campgrounds</span>
          )}
        </div>
        <StalenessBanner date={demand?.collected?.latest} />
      </div>

      {!loading && !error && demand && (
        <div className="calendar-panel" aria-label="Season fill calendar">
          <h2 className="panel-name">Calendar</h2>

          <div className="calx-controls">
            <label className="calx-control">
              <span className="muted small">Campground</span>
              <select value={guid} onChange={(e) => onPickCampground(e.target.value)}>
                <option value="">All campgrounds (total)</option>
                {campgrounds.map((c) => (
                  <option key={c.guid} value={c.guid}>{c.name}</option>
                ))}
              </select>
            </label>
            {guid && (
              <CampsitePicker guid={guid} date={firstNight} value={siteId} onChange={setSiteId} />
            )}
          </div>

          <ScopedCalendar guid={guid} siteId={siteId} demand={demand} />
        </div>
      )}
    </>
  );
}

// The campsite <select> for the chosen campground — loads the roster on demand.
function CampsitePicker({ guid, date, value, onChange }) {
  const [sites, setSites] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    setSites(null);
    setErr(null);
    getCampgroundSites(guid, date)
      .then((d) => { if (live) setSites(d.sites || []); })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [guid, date]);

  return (
    <label className="calx-control">
      <span className="muted small">Campsite</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!sites}>
        <option value="">All sites (aggregate)</option>
        {(sites || []).map((s) => (
          <option key={s.siteId} value={s.siteId}>
            #{s.label}{s.loop ? ` · ${s.loop}` : ''}
          </option>
        ))}
      </select>
      {err && <span className="error-text small">{err}</span>}
    </label>
  );
}

// Renders the right calendar for the current scope:
//   no campground        → bar-fill over the cross-campground nights (demand)
//   campground, no site  → bar-fill over that campground's aggregated site calendars
//   campground + site    → red/green status calendar for the one campsite
function ScopedCalendar({ guid, siteId, demand }) {
  const [scoped, setScoped] = useState(null); // { mode, months } for a drilled scope
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!guid) { setScoped(null); setErr(null); return undefined; }
    let live = true;
    setLoading(true);
    setErr(null);
    setScoped(null);
    const job = siteId
      ? getSiteCalendar(guid, siteId).then((d) => ({ mode: 'status', months: monthGrid(d.by_date || {}) }))
      : getCampgroundSeries(guid, demand?.from || TODAY)
        .then((series) => ({ mode: 'fill', months: monthGrid(aggregateSeries(series)) }));
    job
      .then((r) => { if (live) setScoped(r); })
      .catch((e) => { if (live) setErr(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [guid, siteId, demand]);

  // Default scope: the cross-campground nightly rollup.
  const allMonths = useMemo(() => monthGrid(nightsToValues(demand?.nights ?? [])), [demand]);

  if (!guid) return <AvailabilityCalendar months={allMonths} mode="fill" />;
  if (err) return <div className="error-text" role="alert">{err}</div>;
  if (loading || !scoped) {
    return (
      <div className="control-chip control-chip--progress">
        <ProgressBar indeterminate label="Loading calendar scope" />
        <span className="muted">loading…</span>
      </div>
    );
  }
  return <AvailabilityCalendar months={scoped.months} mode={scoped.mode} />;
}
