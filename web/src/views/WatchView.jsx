import { useEffect, useMemo, useState } from 'react';
import { useMap } from '../map/MapContext';
import { useCircleLayer, rowsToFC, HOVER_PAINT } from '../map/useCircleLayer';
import { getWatches, getWatchCurve } from '../api';
import { Legend, AgencyTag, StateBadge, FillCurve } from '../ds';
import { flyToCampground } from '../map/camera';
import StalenessBanner from '../components/StalenessBanner';
import ProgressBar from '../components/ProgressBar';
import { latestFill, rankWatches, fillColor } from '../panes/watch';

// Hot-date Watch — "watch this date fill up". The collector's HotDateWatchWorkflow
// densely re-checks one (campground, target night) on an adaptive cadence and banks the
// fill-curve to R2 (GET /watch); this view plots % booked over the life of each watch.
// Pins are colored by how full each watched night is right now; the panel ranks the
// hottest watches and draws each one's fill-curve.

// Map pins colored by the watch's current fill (latest reserved / total), carried on
// each feature as `fill`.
const WATCH_PAINT = {
  ...HOVER_PAINT,
  'circle-color': [
    'step', ['get', 'fill'],
    '#3FB950',       // cold (mostly open)
    0.33, '#D29922', // warming
    0.66, '#F85149', // hot (mostly booked)
  ],
};

const pct = (x) => `${Math.round(x * 100)}%`;
const weekday = (night) =>
  new Date(`${night}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export default function WatchView() {
  const { map, ready } = useMap();
  const [watches, setWatches] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // a watch row

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    getWatches()
      .then((d) => { if (live) setWatches(d?.watches ?? []); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => watches ?? [], [watches]);
  const latestUpdate = useMemo(
    () => rows.map((w) => w.updated_at).filter(Boolean).sort().slice(-1)[0]?.slice(0, 10) ?? null,
    [rows],
  );

  // Pins carry the current fill so the paint can color them without recomputing.
  const fc = useMemo(() => rowsToFC(rows, (w) => ({ fill: latestFill(w) })), [rows]);

  const onSelect = (props) => {
    setSelected(props);
    flyToCampground(map, props.lng, props.lat);
  };

  useCircleLayer({
    map, ready, id: 'watch', features: fc, paint: WATCH_PAINT,
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
              <ProgressBar indeterminate label="Loading watches" />
              <span className="muted">loading watches…</span>
            </span>
          )}
          {!loading && !error && (
            <span className="muted control-chip">{rows.length} watched dates · pin fill = how booked</span>
          )}
        </div>
        <StalenessBanner date={latestUpdate} />
      </div>

      <WatchLegend />

      {!loading && !error && <WatchPanel watches={rows} onSelect={onSelect} />}

      {selected && <WatchDetail watch={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function WatchLegend() {
  return (
    <div className="legend-anchor legend-anchor--bl" aria-label="Watch legend">
      <Legend items={[
        { color: 'var(--avail-high)', label: 'Mostly open' },
        { color: 'var(--avail-mid)', label: 'Filling' },
        { color: 'var(--avail-none)', label: 'Mostly booked' },
      ]} />
    </div>
  );
}

function WatchPanel({ watches, onSelect }) {
  const ranked = useMemo(() => rankWatches(watches), [watches]);

  if (!watches.length) {
    return (
      <div className="fleet-panel" aria-label="Hot-date watches">
        <h2 className="panel-name">Watch</h2>
        <div className="muted">No dates are being watched yet.</div>
      </div>
    );
  }

  return (
    <div className="fleet-panel" aria-label="Hot-date watches">
      <h2 className="panel-name">Watch</h2>
      <div className="muted small">Watched nights, filling up — hottest first.</div>

      <section className="watch-section">
        {ranked.map((w) => {
          const fill = latestFill(w);
          return (
            <button
              key={`${w.guid}-${w.target_date}`}
              className="watch-row"
              onClick={() => onSelect(w)}
            >
              <div className="watch-row-head">
                <span className="watch-row-name">{w.name}</span>
                <span className="watch-row-fill" style={{ color: fillColor(fill) }}>
                  {w.sold_out ? 'SOLD OUT' : pct(fill)}
                </span>
              </div>
              <div className="watch-row-date muted small">{weekday(w.target_date)}</div>
              <FillCurve points={w.points} fill={fill} width={260} height={42} />
            </button>
          );
        })}
      </section>
    </div>
  );
}

// Clicking a watch loads its full fill-curve (the list only carries the latest point)
// and shows the series detail.
function WatchDetail({ watch, onClose }) {
  const [curve, setCurve] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let live = true;
    setCurve(null);
    setErr(null);
    getWatchCurve(watch.guid, watch.target_date)
      .then((d) => { if (live) setCurve(d); })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [watch.guid, watch.target_date]);

  const points = curve?.points ?? watch.points ?? [];
  const fill = points.length ? latestFill({ points }) : latestFill(watch);

  return (
    <div className="detail-panel" role="dialog" aria-label="Hot-date watch">
      <button className="panel-close" onClick={onClose} aria-label="Close panel">✕</button>
      <AgencyTag agency={watch.agency} style={{ marginBottom: 4 }} />
      <h2 className="panel-name">{watch.name}</h2>
      <div className="muted small">Target night · {weekday(watch.target_date)}</div>
      <StateBadge color={fillColor(fill)} style={{ margin: '8px 0 12px' }}>
        {watch.sold_out ? 'Sold out' : `${pct(fill)} booked`}
      </StateBadge>

      {err && <div className="error-text" role="alert">{err}</div>}
      <FillCurve points={points} fill={fill} width={260} height={96} />

      <dl className="kv">
        <dt>Observations</dt><dd>{points.length || watch.observations || 0}</dd>
        <dt>Reserved</dt><dd>{points.length ? points[points.length - 1].reserved : watch.reserved}</dd>
        <dt>Open</dt><dd>{points.length ? points[points.length - 1].available : watch.available}</dd>
        <dt>Started</dt><dd>{(curve?.started_at ?? watch.started_at)?.slice(0, 10) ?? '—'}</dd>
      </dl>
      <div className="muted small">% booked over the life of the watch.</div>
    </div>
  );
}
