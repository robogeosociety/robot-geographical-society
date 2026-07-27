import { Link } from 'react-router-dom';
import { describeAsset, plainText } from './markdown.js';

/**
 * Render the codex AST as React elements.
 *
 * Nothing here touches `dangerouslySetInnerHTML` — every node becomes a real
 * element, which is what lets a resolved wikilink be a router `<Link>` (instant
 * client-side navigation between articles) and an unresolved one be inert text.
 */

function Inline({ nodes }) {
  return (nodes || []).map((n, i) => <InlineNode key={i} n={n} />);
}

function InlineNode({ n }) {
  switch (n.t) {
    case 'text':
      return n.v;
    case 'strong':
      return <strong><Inline nodes={n.c} /></strong>;
    case 'em':
      return <em><Inline nodes={n.c} /></em>;
    case 'codespan':
      return <code className="codex-code">{n.v}</code>;
    case 'link':
      return n.href.startsWith('#')
        ? <a href={n.href}><Inline nodes={n.c} /></a>
        : <a href={n.href} target="_blank" rel="noreferrer noopener" className="codex-extlink"><Inline nodes={n.c} /></a>;
    case 'wikilink':
      return <Link to={n.to} className="codex-wikilink"><Inline nodes={n.c} /></Link>;
    case 'deadlink':
      // A note the codex does not carry (shared reference notes, e.g. "Weather
      // & winter"). Plain text, marked only by a faint underline, so a reader
      // never clicks into nothing.
      return <span className="codex-unlinked" title={`${n.target} — not in the codex`}>{n.v}</span>;
    case 'fnref':
      return (
        <sup className="codex-fnref" id={`fnref-${n.id}`}>
          <a href={`#fn-${n.id}`}>[{n.n ?? n.id}]</a>
        </sup>
      );
    case 'img':
      return <img className="codex-img" src={n.src} alt={n.alt} loading="lazy" />;
    case 'embed':
      return <span className="codex-embed-inline">{n.name}</span>;
    default:
      return null;
  }
}

/**
 * A missing attachment.
 *
 * The 447 attachments the vault embeds (Wikimedia lead photos, OSM road SVGs,
 * park-map PDFs — 228 MiB) are not in the artifact, so there is no image to
 * draw. We name the asset instead of drawing a broken frame, and we always keep
 * the credit line beneath it: that attribution is what makes the photo legally
 * usable, and losing it silently would be worse than losing the photo.
 */
function Figure({ node }) {
  return (
    <figure className="codex-figure">
      <div className="codex-figure-slot">
        {node.assets.map((a) => {
          const { kind, label } = describeAsset(a);
          return (
            <div className="codex-asset" key={a} data-kind={kind}>
              <span className="codex-asset-kind">{label}</span>
              <span className="codex-asset-name">{a}</span>
            </div>
          );
        })}
        <span className="codex-asset-note">not shipped in this artifact</span>
      </div>
      {node.caption && (
        <figcaption className="codex-figure-caption"><Inline nodes={node.caption} /></figcaption>
      )}
    </figure>
  );
}

function Items({ items }) {
  return items.map((it, i) => (
    <li key={i}>
      <Inline nodes={it.c} />
      {(it.children || []).map((child, j) => <Block key={j} b={child} />)}
    </li>
  ));
}

function Block({ b }) {
  switch (b.t) {
    case 'h': {
      const Tag = `h${Math.min(b.d, 6)}`;
      return <Tag id={b.id} className="codex-h"><Inline nodes={b.c} /></Tag>;
    }
    case 'p':
      return <p><Inline nodes={b.c} /></p>;
    case 'ul':
      return <ul><Items items={b.items} /></ul>;
    case 'ol':
      return <ol><Items items={b.items} /></ol>;
    case 'quote':
      return (
        <blockquote className={b.kind ? `codex-callout codex-callout-${b.kind}` : 'codex-quote'}>
          {b.title && <div className="codex-callout-title">{b.title}</div>}
          {b.c.map((child, i) => <Block key={i} b={child} />)}
        </blockquote>
      );
    case 'table':
      return (
        <div className="codex-table-scroll">
          <table className="codex-table">
            <thead>
              <tr>{b.head.map((cell, i) => (
                <th key={i} style={{ textAlign: b.align?.[i] || 'left' }}><Inline nodes={cell} /></th>
              ))}</tr>
            </thead>
            <tbody>
              {b.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => (
                  <td key={j} style={{ textAlign: b.align?.[j] || 'left' }}><Inline nodes={cell} /></td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'code':
      return <pre className="codex-pre"><code>{b.v}</code></pre>;
    case 'hr':
      return <hr className="codex-hr" />;
    case 'figure':
      return <Figure node={b} />;
    default:
      return null;
  }
}

/** Render a list of block nodes. */
export function Markdown({ blocks }) {
  return (blocks || []).map((b, i) => <Block key={i} b={b} />);
}

/** The footnote rail at the foot of an article. */
export function Footnotes({ notes }) {
  if (!notes?.length) return null;
  return (
    <section className="codex-footnotes" aria-labelledby="codex-footnotes-h">
      <h2 id="codex-footnotes-h" className="codex-h">References</h2>
      <ol>
        {notes.map((n) => (
          <li key={n.id} id={`fn-${n.id}`} value={n.n}>
            <Inline nodes={n.c} />{' '}
            <a href={`#fnref-${n.id}`} className="codex-fnback" aria-label={`back to reference ${n.id}`}>↩</a>
          </li>
        ))}
      </ol>
    </section>
  );
}

export { plainText };
