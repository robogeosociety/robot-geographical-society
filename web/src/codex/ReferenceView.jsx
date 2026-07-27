import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadReference } from './data.js';
import { Footnotes, Markdown } from './Markdown.jsx';
import { Toc } from './Toc.jsx';
import { useResource } from './useResource.js';

/**
 * A shared reference note — the vault's cross-cutting pages: the forest and
 * park units (`Gifford Pinchot NF`), the hazard explainers (`Volcanic & lahar`,
 * `Tsunami & coastal`), and the booking primers (`Reservation systems`,
 * `First-come, first-served`).
 *
 * These are the corpus's hub pages: a unit note lists every campground in it,
 * so a reference article is mostly a dense block of links back down into the
 * campground tier. They have no infobox — there is no structured row behind
 * them, only prose — so the article runs wider than a campground page.
 */
export default function ReferenceView() {
  const { slug } = useParams();
  const load = useCallback(() => loadReference(slug), [slug]);
  const { status, data, error } = useResource(load, [slug]);

  if (status === 'loading') return <p className="codex-note">Loading…</p>;
  if (status === 'error') {
    return (
      <div className="codex-empty">
        <h1>Not in the codex</h1>
        <p className="codex-note codex-note-bad">
          No reference note for <code className="codex-code">{slug}</code>. {error.message}
        </p>
        <p><Link to="/codex" className="codex-wikilink">← Back to the index</Link></p>
      </div>
    );
  }

  return (
    <article className="codex-article">
      <nav className="codex-crumbs" aria-label="Breadcrumb">
        <Link to="/codex">Codex</Link>
        <span aria-hidden="true">/</span>
        <span className="codex-crumb-loop">Reference</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{data.name}</span>
      </nav>

      <h1 className="codex-title">{data.name}</h1>
      <p className="codex-subtitle">Shared reference note</p>

      <div className="codex-layout codex-layout-wide">
        <Toc items={data.toc} />
        <div className="codex-body">
          <Markdown blocks={data.body} />
          <Footnotes notes={data.footnotes} />
        </div>
      </div>
    </article>
  );
}
