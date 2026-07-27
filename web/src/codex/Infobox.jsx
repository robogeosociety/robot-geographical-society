import { AgencyTag } from '../ds';

/** One label/value row. Renders nothing when the value is missing. */
function Row({ label, children, mono = false }) {
  if (children == null || children === '') return null;
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? 'codex-num' : undefined}>{children}</dd>
    </>
  );
}

function coords(lat, lng) {
  if (lat == null || lng == null) return null;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lng).toFixed(4)}°${ew}`;
}

/**
 * The campground infobox — the structured half of a codex article.
 *
 * Everything here comes from the artifact's columns rather than the prose, so
 * it stays true even when an article's narrative is thin. `guid` is NULL in the
 * artifact by design; when the build could join the row to
 * `backend/src/campsites-index.json` it is shown as provenance, and otherwise
 * the row simply disappears.
 */
export function Infobox({ cg }) {
  const elevFt = cg.elev_m == null ? null : Math.round(cg.elev_m * 3.28084);
  return (
    <aside className="codex-infobox" aria-label={`${cg.name} facts`}>
      <div className="codex-infobox-head">
        {cg.agency && <AgencyTag agency={cg.agency} withDot />}
        <h2>{cg.name}</h2>
      </div>
      <dl>
        <Row label="Managed by">{cg.agency_full || cg.agency}</Row>
        <Row label="Unit">{cg.unit}</Row>
        <Row label="Coordinates" mono>{coords(cg.lat, cg.lng)}</Row>
        <Row label="Elevation" mono>
          {cg.elev_m == null ? null : `${Math.round(cg.elev_m)} m · ${elevFt} ft`}
        </Row>
        <Row label="Reservable">{cg.reservable == null ? null : (cg.reservable ? 'Yes' : 'First-come')}</Row>
        <Row label="Sites" mono>{cg.site_count ? String(cg.site_count) : null}</Row>
        <Row label="Hazards">
          {cg.hazards?.length ? (
            <span className="codex-hazards">
              {cg.hazards.map((h) => <span className="codex-hazard" key={h} data-hazard={h}>{h}</span>)}
            </span>
          ) : null}
        </Row>
        <Row label="Official page">
          {cg.official_url ? (
            <a href={cg.official_url} target="_blank" rel="noreferrer noopener" className="codex-extlink">
              {new URL(cg.official_url).hostname.replace(/^www\./, '')}
            </a>
          ) : null}
        </Row>
        <Row label="Inventory id" mono>{cg.guid}</Row>
        <Row label="Exported" mono>{cg.updated ? cg.updated.slice(0, 10) : null}</Row>
      </dl>
    </aside>
  );
}
