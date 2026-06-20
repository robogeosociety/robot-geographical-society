import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMap } from '../map/MapContext';
import { useCircleLayer, rowsToFC, HOVER_PAINT } from '../map/useCircleLayer';
import { getCollectors, getDlq, reactivate, getMe } from '../api';
import { STATE_STYLE } from '../constants';

const COLLECTOR_PAINT = {
  ...HOVER_PAINT,
  'circle-color': [
    'match', ['get', 'state'],
    'healthy', STATE_STYLE.healthy.color,
    'overdue', STATE_STYLE.overdue.color,
    'quarantined', STATE_STYLE.quarantined.color,
    'disabled', STATE_STYLE.disabled.color,
    '#CCCCCC',
  ],
};

export default function CollectorsView() {
  const { map, ready } = useMap();
  const [collectors, setCollectors] = useState([]);
  const [dlq, setDlq] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false); // gates the reactivate action (backend enforces too)

  // Resolve the caller's role; a /me failure just leaves the UI as viewer.
  useEffect(() => {
    let live = true;
    getMe().then((me) => { if (live) setIsAdmin(!!me?.isAdmin); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([getCollectors(), getDlq()])
      .then(([c, d]) => { setCollectors(c); setDlq(d.sites || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const fc = useMemo(() => rowsToFC(collectors), [collectors]);

  useCircleLayer({
    map, ready, id: 'collectors', features: fc, paint: COLLECTOR_PAINT,
    onSelect: (props) => setSelected(props),
    onEmptyClick: () => setSelected(null),
  });

  const counts = useMemo(() => {
    const c = { total: collectors.length, healthy: 0, overdue: 0, quarantined: 0, disabled: 0 };
    for (const x of collectors) if (x.state in c) c[x.state] += 1;
    return c;
  }, [collectors]);

  const onReactivate = useCallback(async (id) => {
    await reactivate(id);
    await load();
  }, [load]);

  return (
    <>
      <div className="legend legend-states" aria-label="Collector state legend">
        {Object.entries(STATE_STYLE).map(([k, v]) => (
          <span key={k} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: v.color }} />
            {v.label}
          </span>
        ))}
      </div>

      <FleetStatsPanel counts={counts} dlq={dlq} loading={loading} error={error}
        onReactivate={onReactivate} isAdmin={isAdmin} />

      {selected && <CollectorPopup collector={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function fmtAge(ageDays) {
  if (ageDays == null) return 'never';
  if (ageDays < 1) return 'today';
  if (ageDays < 2) return '1 day ago';
  return `${Math.round(ageDays)} days ago`;
}

function fmtDue(dueMs) {
  if (dueMs == null) return '—';
  if (dueMs <= 0) return 'overdue';
  const h = dueMs / 3.6e6;
  if (h < 1) return `${Math.round(dueMs / 6e4)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

function FleetStatsPanel({ counts, dlq, loading, error, onReactivate, isAdmin }) {
  return (
    <div className="fleet-panel" aria-label="Fleet health">
      <div className="fleet-head">
        <h2 className="panel-name">Fleet health</h2>
        <span className={`role-badge ${isAdmin ? 'role-admin' : 'role-viewer'}`}>
          {isAdmin ? 'admin' : 'viewer'}
        </span>
      </div>
      {loading && <div className="muted">loading…</div>}
      {error && <div className="error-text" role="alert">{error}</div>}

      <div className="stat-grid">
        <Stat label="Total" value={counts.total} />
        <Stat label="Healthy" value={counts.healthy} color={STATE_STYLE.healthy.color} />
        <Stat label="Overdue" value={counts.overdue} color={STATE_STYLE.overdue.color} />
        <Stat label="Quarantined" value={counts.quarantined} color={STATE_STYLE.quarantined.color} />
        <Stat label="Disabled" value={counts.disabled} color={STATE_STYLE.disabled.color} />
      </div>

      {dlq.length > 0 && (
        <div className="quarantine-list">
          <h3>Quarantined ({dlq.length}){!isAdmin && <span className="muted small"> · reactivate is admin-only</span>}</h3>
          {dlq.map((s) => (
            <div key={s.id} className="quarantine-item">
              <div className="q-head">
                <span className="q-name">{s.name}</span>
                {isAdmin && (
                  <button className="btn-reactivate" onClick={() => onReactivate(s.id)}>
                    Reactivate
                  </button>
                )}
              </div>
              <div className="muted small">
                {s.failures} fails · since {s.sinceISO?.slice(0, 10)}
              </div>
              {s.lastError && <div className="q-error" title={s.lastError}>{s.lastError}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="stat">
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function CollectorPopup({ collector, onClose }) {
  const style = STATE_STYLE[collector.state] || { color: '#ccc', label: collector.state };
  return (
    <div className="detail-panel" role="dialog" aria-label="Collector detail">
      <button className="panel-close" onClick={onClose} aria-label="Close panel">✕</button>
      <div className="panel-agency">{collector.agency}</div>
      <h2 className="panel-name">{collector.name}</h2>
      <div className="state-badge" style={{ background: style.color }}>{style.label}</div>
      <dl className="kv">
        <dt>Last collected</dt><dd>{collector.lastCollectedDate || '—'} ({fmtAge(collector.ageDays)})</dd>
        <dt>Next due</dt><dd>{fmtDue(collector.dueMs)}</dd>
        <dt>Consecutive failures</dt><dd>{collector.fails ?? 0}</dd>
        <dt>Collecting</dt><dd>{collector.collect === false ? 'no (disabled)' : 'yes'}</dd>
      </dl>
    </div>
  );
}
