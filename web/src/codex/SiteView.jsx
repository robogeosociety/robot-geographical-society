import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { codexHref, siteHref } from './build.js';
import { loadCampground, loadSiteBundle } from './data.js';
import { Footnotes, Markdown } from './Markdown.jsx';
import { useResource } from './useResource.js';

/** Previous/next within the site's own loop — the encyclopedia's page turn. */
function neighbours(cg, key) {
  const loop = cg.loops.find((l) => l.sites.some((s) => s.key === key));
  if (!loop) return { prev: null, next: null, loop: null };
  const i = loop.sites.findIndex((s) => s.key === key);
  return { prev: loop.sites[i - 1] || null, next: loop.sites[i + 1] || null, loop };
}

function Fact({ label, children }) {
  if (children == null || children === '') return null;
  return <div className="codex-fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

/**
 * One campsite — the deepest level of the codex.
 *
 * These pages are the reason the viewer renders on demand rather than
 * pre-generating: there are 9,205 of them. The body comes out of the
 * campground's site bundle, which is a single fetch shared by every sibling
 * site, so walking a loop costs one request for the whole loop.
 */
export default function SiteView() {
  const { slug, site: key } = useParams();
  const load = useCallback(
    () => Promise.all([loadCampground(slug), loadSiteBundle(slug)]).then(([cg, bundle]) => ({ cg, bundle })),
    [slug],
  );
  const { status, data, error } = useResource(load, [slug]);

  if (status === 'loading') return <p className="codex-note">Loading…</p>;
  if (status === 'error') {
    return (
      <div className="codex-empty">
        <h1>Not in the codex</h1>
        <p className="codex-note codex-note-bad">{error.message}</p>
        <p><Link to="/codex" className="codex-wikilink">← Back to the index</Link></p>
      </div>
    );
  }

  const { cg, bundle } = data;
  const s = bundle.sites[key];

  if (!s) {
    return (
      <div className="codex-empty">
        <h1>No such site</h1>
        <p className="codex-note codex-note-bad">
          <code className="codex-code">{key}</code> is not a site in {cg.name}.
        </p>
        <p><Link to={codexHref(slug)} className="codex-wikilink">← {cg.name}</Link></p>
      </div>
    );
  }

  const { prev, next, loop } = neighbours(cg, key);

  return (
    <article className="codex-article codex-article-site">
      <nav className="codex-crumbs" aria-label="Breadcrumb">
        <Link to="/codex">Codex</Link>
        <span aria-hidden="true">/</span>
        <Link to={codexHref(slug)}>{cg.name}</Link>
        {loop && loop.name !== 'Ungrouped' && (
          <>
            <span aria-hidden="true">/</span>
            <span className="codex-crumb-loop">{loop.name}</span>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="codex-num">{s.site}</span>
      </nav>

      <h1 className="codex-title">{cg.name} <span className="codex-num codex-title-site">{s.site}</span></h1>

      <dl className="codex-facts">
        <Fact label="Loop">{s.loop}</Fact>
        <Fact label="Type">{s.type}</Fact>
        <Fact label="Use">{s.use}</Fact>
        <Fact label="Reservable">{s.reservable == null ? null : (s.reservable ? 'Yes' : 'No')}</Fact>
        <Fact label="Provider id"><span className="codex-num">{s.provider_site_id}</span></Fact>
        <Fact label="Reserve">
          {s.official_url ? (
            <a href={s.official_url} target="_blank" rel="noreferrer noopener" className="codex-extlink">recreation.gov</a>
          ) : null}
        </Fact>
      </dl>

      <div className="codex-body">
        <Markdown blocks={s.body} />
        <Footnotes notes={s.footnotes} />
      </div>

      <nav className="codex-pager" aria-label="Sites in this loop">
        {prev
          ? <Link to={siteHref(slug, prev.key)} className="codex-pager-prev">← <span className="codex-num">{prev.site}</span></Link>
          : <span />}
        <Link to={codexHref(slug)} className="codex-pager-up">All sites</Link>
        {next
          ? <Link to={siteHref(slug, next.key)} className="codex-pager-next"><span className="codex-num">{next.site}</span> →</Link>
          : <span />}
      </nav>
    </article>
  );
}
