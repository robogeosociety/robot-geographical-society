import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { siteHref } from './build.js';
import { loadCampground } from './data.js';
import { Footnotes, Markdown } from './Markdown.jsx';
import { Infobox } from './Infobox.jsx';
import { Toc, tocEntries } from './Toc.jsx';
import { useResource } from './useResource.js';

/** One loop's site roster. */
function Roster({ slug, sites }) {
  return (
    <ul className="codex-sites">
      {sites.map((s) => (
        <li key={s.key}>
          <Link to={siteHref(slug, s.key)} className="codex-site-chip" title={[s.type, s.use].filter(Boolean).join(' · ')}>
            <span className="codex-num">{s.site}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * A campground article: the narrative, the infobox, and the way down into the
 * per-site pages.
 *
 * Loops are only rendered as a level of nesting when they are actually a
 * grouping — a campground whose sites all sit in one loop (the common case,
 * and one where the exporter sometimes leaves `loop` NULL entirely) gets a flat
 * roster rather than a section header repeating the campground's own name.
 */
export default function CampgroundView() {
  const { slug } = useParams();
  const load = useCallback(() => loadCampground(slug), [slug]);
  const { status, data, error } = useResource(load, [slug]);

  if (status === 'loading') return <p className="codex-note">Loading…</p>;
  if (status === 'error') {
    return (
      <div className="codex-empty">
        <h1>Not in the codex</h1>
        <p className="codex-note codex-note-bad">
          No article for <code className="codex-code">{slug}</code>. {error.message}
        </p>
        <p><Link to="/codex" className="codex-wikilink">← Back to the index</Link></p>
      </div>
    );
  }

  const cg = data;
  const multiLoop = cg.loops.length > 1;
  const total = cg.loops.reduce((n, l) => n + l.sites.length, 0);
  const toc = tocEntries(cg.toc, total ? [{ id: 'sites', depth: 2, text: `Sites (${total})` }] : []);

  return (
    <article className="codex-article">
      <nav className="codex-crumbs" aria-label="Breadcrumb">
        <Link to="/codex">Codex</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{cg.name}</span>
      </nav>

      <h1 className="codex-title">{cg.name}</h1>
      {cg.unit && <p className="codex-subtitle">{cg.unit}</p>}

      <div className={toc.length ? 'codex-layout' : 'codex-layout codex-layout-notoc'}>
        <Toc entries={toc} />

        <div className="codex-body">
          <Markdown blocks={cg.body} />

          <section aria-labelledby="sites">
            <h2 id="sites" className="codex-h">Sites</h2>
            {total === 0 ? (
              <p className="codex-note codex-note-quiet">
                No per-site pages. The codex only covered campgrounds with a reservable
                recreation.gov inventory{cg.site_count ? `, though the record counts ${cg.site_count} sites` : ''}.
              </p>
            ) : multiLoop ? (
              cg.loops.map((loop) => (
                <section key={loop.slug} className="codex-loop" aria-labelledby={`loop-${loop.slug}`}>
                  <h3 id={`loop-${loop.slug}`} className="codex-loop-title">
                    {loop.name} <span className="codex-num codex-loop-count">{loop.sites.length}</span>
                  </h3>
                  <Roster slug={cg.slug} sites={loop.sites} />
                </section>
              ))
            ) : (
              <>
                {cg.loops[0].name !== 'Ungrouped' && (
                  <p className="codex-note codex-note-quiet">All sites are in {cg.loops[0].name}.</p>
                )}
                <Roster slug={cg.slug} sites={cg.loops[0].sites} />
              </>
            )}
            {cg.site_count > total && total > 0 && (
              <p className="codex-note codex-note-quiet">
                The record counts {cg.site_count} sites; {total} have an article in this export.
              </p>
            )}
          </section>

          <Footnotes notes={cg.footnotes} />
        </div>

        <Infobox cg={cg} />
      </div>
    </article>
  );
}
