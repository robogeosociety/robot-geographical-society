import { useEffect, useMemo, useState } from 'react';
import { useMap } from '../map/MapContext';
import { useCircleLayer, rowsToFC, HOVER_PAINT } from '../map/useCircleLayer';
import { getDemand } from '../api';
import { AGENCY_COLORS, agencyShort } from '../constants';
import StalenessBanner from '../components/StalenessBanner';
import ProgressBar from '../components/ProgressBar';
import {
  bookedPct, demandRatio, hottestNights, inDemandCampgrounds, demandColor,
} from '../panes/demand';

// Cross-campground demand — the product sibling of Availability. Where Availability
// asks "what's open on one night", Demand asks "which upcoming nights and which
// campgrounds are getting booked up", aggregated across the whole fleet from the
// banked R2 summaries (GET /demand). Pins are colored by how booked each campground
// is; the panel ranks the hottest nights and the most in-demand campgrounds.

// Map pins colored by the campground's demand ratio (reserved / bookable), carried on
// each feature as `dratio`.
const DEMAND_PAINT = {
  ...HOVER_PAINT,
  'circle-color': [
    'step', ['get', 'dratio'],
    '#3FB950',       // cold (mostly open)
    0.33, '#D29922', // warming
    0.66, '#F85149', // hot (mostly booked)
  ],
};

export default function DemandView() {
  const { map, ready } = useMap();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // a campground row

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    getDemand()
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const campgrounds = useMemo(() => data?.campgrounds ?? [], [data]);
  const nights = data?.nights ?? [];

  // Pins carry the demand ratio so the paint can color them without recomputing.
  const fc = useMemo(
    () => rowsToFC(campgrounds, (c) => ({ dratio: demandRatio(c) })),
    [campgrounds],
  );

  const onSelect = (props) => {
    setSelected(props);
    if (map && Number.isFinite(props.lat) && Number.isFinite(props.lng)) {
      map.flyTo({ center: [props.lng, props.lat], zoom: Math.max(map.getZoom(), 9) });
    }
  };

  useCircleLayer({
    map, ready, id: 'demand', features: fc, paint: DEMAND_PAINT,
    onSelect,
    onEmptyClick: () => setSelected(null),
  });

  return (
    <>
      <div className="map-overlay-tl">
        <div className="control-row">
          {error && <span className="error-text control-chip" role="alert">{error}</span>}
          {loading && (
            <span className="control-chip control-chip--progress">
              <ProgressBar indeterminate label="Loading demand" />
              <span className="muted">loading demand…</span>
            </span>
          )}
          {!loading && !error && (
            <span className="muted control-chip">{campgrounds.length} campgrounds · pin fill = how booked</span>
          )}
        </div>
        <StalenessBanner date={data?.collected?.latest} />
      </div>

      <DemandLegend />

      {!loading && !error && (
        <DemandPanel nights={nights} campgrounds={campgrounds} onSelect={onSelect} />
      )}

      {selected && <CampgroundDemandPopup campground={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function DemandLegend() {
  const items = [
    ['#3FB950', 'Mostly open'],
    ['#D29922', 'Filling'],
    ['#F85149', 'Mostly booked'],
  ];
  return (
    <div className="legend legend-states" aria-label="Demand legend">
      {items.map(([color, label]) => (
        <span key={label} className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

const pct = (x) => `${Math.round(x * 100)}%`;
const weekday = (night) =>
  new Date(`${night}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function DemandPanel({ nights, campgrounds, onSelect }) {
  const hottest = useMemo(() => hottestNights(nights, 6), [nights]);
  const inDemand = useMemo(() => inDemandCampgrounds(campgrounds, 12), [campgrounds]);

  if (!nights.length && !campgrounds.length) {
    return (
      <div className="fleet-panel" aria-label="Demand">
        <h2 className="panel-name">Demand</h2>
        <div className="muted">No upcoming availability captured yet.</div>
      </div>
    );
  }

  // Bound the night list so the panel stays one viewport — the soonest captured nights.
  const upcoming = nights.slice(0, 14);

  return (
    <div className="fleet-panel" aria-label="Demand">
      <h2 className="panel-name">Demand</h2>

      <section className="demand-section">
        <h3>Most in-demand campgrounds</h3>
        {inDemand.map((c) => (
          <button key={c.guid} className="demand-row" onClick={() => onSelect(c)}>
            <span className="demand-row-name">{c.name}</span>
            <DemandBar ratio={demandRatio(c)} label={pct(demandRatio(c))} />
          </button>
        ))}
      </section>

      <section className="demand-section">
        <h3>Hottest upcoming nights</h3>
        {hottest.map((n) => (
          <div key={n.night} className="demand-row">
            <span className="demand-row-name">{weekday(n.night)}</span>
            <DemandBar ratio={bookedPct(n)} label={`${n.reserved} booked · ${pct(bookedPct(n))}`} />
          </div>
        ))}
      </section>

      <section className="demand-section">
        <h3>% booked by night</h3>
        {upcoming.map((n) => (
          <div key={n.night} className="demand-row">
            <span className="demand-row-name small">{weekday(n.night)}</span>
            <DemandBar ratio={bookedPct(n)} label={pct(bookedPct(n))} />
          </div>
        ))}
      </section>
    </div>
  );
}

function DemandBar({ ratio, label }) {
  return (
    <span className="demand-bar" title={label}>
      <span className="demand-bar-track">
        <span
          className="demand-bar-fill"
          style={{ width: pct(ratio), background: demandColor(ratio) }}
        />
      </span>
      <span className="demand-bar-label muted small">{label}</span>
    </span>
  );
}

function CampgroundDemandPopup({ campground, onClose }) {
  const ratio = demandRatio(campground);
  return (
    <div className="detail-panel" role="dialog" aria-label="Campground demand">
      <button className="panel-close" onClick={onClose} aria-label="Close panel">✕</button>
      <div className="panel-agency" style={{ color: AGENCY_COLORS[agencyShort(campground.agency)] }}>
        {campground.agency}
      </div>
      <h2 className="panel-name">{campground.name}</h2>
      <div className="state-badge" style={{ background: demandColor(ratio) }}>{pct(ratio)} booked</div>
      <dl className="kv">
        <dt>Reserved (upcoming)</dt><dd>{campground.reserved}</dd>
        <dt>Open (upcoming)</dt><dd>{campground.available}</dd>
        <dt>Campsite-nights captured</dt><dd>{campground.total}</dd>
      </dl>
      <div className="muted small">Summed across the captured upcoming nights.</div>
    </div>
  );
}
