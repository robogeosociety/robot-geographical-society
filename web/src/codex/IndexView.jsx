import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AgencyTag, FilterChip, agencyMeta } from '../ds';
import { codexHref, filterCampgrounds, refHref } from './build.js';
import { loadIndex } from './data.js';
import { useResource } from './useResource.js';

/**
 * The codex index — every campground article, searchable and facetable.
 *
 * The whole corpus is ~200 metadata rows in one JSON file, so search runs
 * locally over name / unit / agency / dek / section headings. No request per
 * keystroke, no backend, instant results.
 */
export default function IndexView() {
  const { status, data, error } = useResource(loadIndex, []);
  const [q, setQ] = useState('');
  const [agency, setAgency] = useState(null);
  const [hazard, setHazard] = useState(null);
  const [reservable, setReservable] = useState(null);

  const rows = useMemo(() => data?.campgrounds || [], [data]);
  const refs = useMemo(() => data?.references || [], [data]);
  const shown = useMemo(
    () => filterCampgrounds(rows, { q, agency, hazard, reservable }),
    [rows, q, agency, hazard, reservable],
  );

  if (status === 'loading') return <p className="codex-note">Loading the codex…</p>;
  if (status === 'error') {
    return <p className="codex-note codex-note-bad">The codex index could not be loaded: {error.message}</p>;
  }
  if (!data.available) {
    return (
      <div className="codex-empty">
        <h1>Campsite Codex</h1>
        <p className="codex-note">
          The codex artifact (<code className="codex-code">campsite-codex.db</code>) is not present in
          this build, so there is nothing to read yet. Drop the export at
          {' '}<code className="codex-code">data/campsite-codex.db</code> and run
          {' '}<code className="codex-code">npm run codex</code>.
        </p>
        {data.reason && <p className="codex-note codex-note-quiet">{data.reason}</p>}
      </div>
    );
  }

  const { counts } = data;

  return (
    <div className="codex-index">
      <header className="codex-index-head">
        <p className="rgs-label">Robot Geographical Society</p>
        <h1>Campsite Codex</h1>
        <p className="codex-dek">
          The camping vault&rsquo;s field notes, one article per campground —
          {' '}<strong className="codex-num">{counts.campgrounds}</strong> campgrounds,
          {' '}<strong className="codex-num">{counts.sites}</strong> individual sites and
          {' '}<strong className="codex-num">{counts.references ?? 0}</strong> shared
          reference notes, exported {data.generated?.slice(0, 10)}.
        </p>
      </header>

      <div className="codex-filters">
        <input
          type="search"
          className="codex-search"
          placeholder="Search campgrounds, units, sections…"
          aria-label="Search the codex"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="codex-chiprow" role="group" aria-label="Filter by agency">
          {counts.agencies.map((a) => (
            <FilterChip
              key={a}
              active={agency === a}
              dot={agencyMeta(a).color}
              accent={agencyMeta(a).color}
              onClick={() => setAgency(agency === a ? null : a)}
            >
              {agencyMeta(a).label || a}
            </FilterChip>
          ))}
          <FilterChip active={reservable === true} onClick={() => setReservable(reservable === true ? null : true)}>
            Reservable
          </FilterChip>
        </div>
        <div className="codex-chiprow" role="group" aria-label="Filter by hazard">
          {counts.hazards.map((h) => (
            <FilterChip key={h} active={hazard === h} onClick={() => setHazard(hazard === h ? null : h)}>
              {h}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="codex-count codex-num">
        {shown.length} of {rows.length} campgrounds
      </p>

      <ul className="codex-cards">
        {shown.map((cg) => (
          <li key={cg.slug}>
            <Link to={codexHref(cg.slug)} className="codex-card">
              {cg.agency && <AgencyTag agency={cg.agency} />}
              <h2>{cg.name}</h2>
              {cg.unit && <p className="codex-card-unit">{cg.unit}</p>}
              {cg.summary && <p className="codex-card-dek">{cg.summary}</p>}
              <p className="codex-card-meta codex-num">
                {cg.sites_present ? `${cg.sites_present} site pages` : 'no site pages'}
                {cg.elev_m != null && ` · ${Math.round(cg.elev_m)} m`}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {shown.length === 0 && <p className="codex-note">No campground matches those filters.</p>}

      {refs.length > 0 && (
        <section className="codex-refs" aria-labelledby="codex-refs-h">
          <h2 id="codex-refs-h" className="codex-h">Reference notes</h2>
          <p className="codex-note">
            The cross-cutting pages the campground articles link into — forest and park
            units, the hazard explainers, and the booking primers.
          </p>
          <ul className="codex-reflist">
            {refs.map((r) => (
              <li key={r.slug}>
                <Link to={refHref(r.slug)} className="codex-refcard">
                  <span className="codex-refcard-name">{r.name}</span>
                  {r.summary && <span className="codex-refcard-dek">{r.summary}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
