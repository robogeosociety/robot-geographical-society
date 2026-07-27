/**
 * Markdown → AST for the campsite codex.
 *
 * The codex bodies are Obsidian notes (frontmatter already stripped by the
 * exporter): headings, prose, bullet/number lists, GFM pipe tables, callouts,
 * fenced code, footnotes, images, and — everywhere — `[[wikilinks]]`.
 *
 * We parse to a plain-JSON AST at BUILD time (see web/scripts/build-codex.js)
 * and render that AST to real React elements at read time (see Markdown.jsx).
 * Two reasons this beats shipping HTML strings:
 *
 *  1. No `dangerouslySetInnerHTML` anywhere — vault prose never becomes markup
 *     the browser is asked to trust.
 *  2. A resolved wikilink can become a real router `<Link>`, so cross-references
 *     between codex articles navigate client-side instead of reloading the app.
 *
 * The AST is deliberately small and stable; it is the wire format between the
 * build script and the viewer, so treat node shapes as a contract.
 *
 *   block  := h | p | ul | ol | quote | table | code | hr | fndef
 *   inline := text | strong | em | codespan | link | wikilink | deadlink
 *           | fnref | img
 *
 * Pure ESM with no DOM and no React, so the Node build script imports it
 * directly.
 */

/** GitHub-ish slug for heading anchors and loop keys. */
export function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

const INLINE_STOP = /[`*_[!]/;

/**
 * Parse an inline run into inline nodes.
 * `resolve(target)` returns a href string for a known wikilink target, or null
 * (unresolved links render as plain text — never as a dead <a>).
 */
export function parseInline(src, resolve = () => null) {
  const out = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) { out.push({ t: 'text', v: buf }); buf = ''; }
  };

  while (i < src.length) {
    const ch = src[i];

    // `code span`
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'codespan', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // ![[embed]]  — an Obsidian attachment embed. The codex ships no
    // attachments (park-map PDFs, OSM SVGs, Wikimedia leads all stayed behind),
    // so an embed renders as a named placeholder rather than a broken <img>.
    if (ch === '!' && src.startsWith('![[', i)) {
      const end = src.indexOf(']]', i + 3);
      if (end > i) {
        flush();
        out.push({ t: 'embed', name: src.slice(i + 3, end).split('|')[0].trim() });
        i = end + 2;
        continue;
      }
    }

    // ![alt](src)
    if (ch === '!' && src[i + 1] === '[') {
      const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(src.slice(i));
      if (m) {
        flush();
        out.push({ t: 'img', alt: m[1], src: m[2] });
        i += m[0].length;
        continue;
      }
    }

    // [[wikilink]] / [[wikilink|alias]] / [[wikilink#Heading]] / [[#Heading]]
    if (ch === '[' && src[i + 1] === '[') {
      const end = src.indexOf(']]', i + 2);
      if (end > i) {
        flush();
        out.push(wikilinkNode(src.slice(i + 2, end), resolve));
        i = end + 2;
        continue;
      }
    }

    // [^footnote]
    if (ch === '[' && src[i + 1] === '^') {
      const m = /^\[\^([^\]]+)\]/.exec(src.slice(i));
      if (m) {
        flush();
        out.push({ t: 'fnref', id: m[1] });
        i += m[0].length;
        continue;
      }
    }

    // [text](href)
    if (ch === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(src.slice(i));
      if (m) {
        flush();
        out.push({ t: 'link', href: m[2], c: parseInline(m[1], resolve) });
        i += m[0].length;
        continue;
      }
    }

    // **strong**
    if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end), resolve) });
        i = end + 2;
        continue;
      }
    }

    // *em* / _em_
    if (ch === '*' || ch === '_') {
      const end = src.indexOf(ch, i + 1);
      if (end > i + 1 && !/\s/.test(src[i + 1])) {
        flush();
        out.push({ t: 'em', c: parseInline(src.slice(i + 1, end), resolve) });
        i = end + 1;
        continue;
      }
    }

    // Plain run — hop to the next character that could open a construct.
    const rest = src.slice(i + 1);
    const next = rest.search(INLINE_STOP);
    if (next === -1) { buf += src.slice(i); break; }
    buf += src.slice(i, i + 1 + next);
    i += 1 + next;
  }

  flush();
  return out;
}

/**
 * One `[[…]]` body → a node.
 *
 * Resolution is deliberately conservative: a link becomes clickable only when
 * the resolver hands back a href. Everything else — shared reference notes that
 * stayed in the vault (`[[Gifford Pinchot NF]]`, `[[Weather & winter]]`),
 * typos, links to notes the exporter did not carry — degrades to plain text
 * carrying the alias the author wrote. A reader never meets a dead link.
 */
export function wikilinkNode(body, resolve = () => null) {
  const [rawTarget, rawAlias] = body.split('|');
  const alias = (rawAlias || '').trim();
  const [target, hash] = String(rawTarget).split('#');
  const name = target.trim();
  const anchor = (hash || '').trim();

  // [[#Heading]] — a same-article jump. Always resolvable.
  if (!name && anchor) {
    return { t: 'link', href: `#${slugify(anchor)}`, c: [{ t: 'text', v: alias || anchor }] };
  }

  const label = alias || (anchor ? `${name} § ${anchor}` : name);
  const href = resolve(name);
  if (!href) return { t: 'deadlink', v: label, target: name };
  return {
    t: 'wikilink',
    to: anchor ? `${href}#${slugify(anchor)}` : href,
    c: [{ t: 'text', v: label }],
  };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_HR = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
const RE_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*(\S*)/;
const RE_UL = /^(\s*)[-*+]\s+(.*)$/;
const RE_OL = /^(\s*)\d+[.)]\s+(.*)$/;
const RE_QUOTE = /^\s{0,3}>\s?(.*)$/;
const RE_FNDEF = /^\[\^([^\]]+)\]:\s*(.*)$/;
const RE_CALLOUT = /^\[!(\w+)\]-?\s*(.*)$/;

function isBlockStart(line) {
  return (
    !line.trim()
    || RE_HEADING.test(line)
    || RE_HR.test(line)
    || RE_FENCE.test(line)
    || RE_UL.test(line)
    || RE_OL.test(line)
    || RE_QUOTE.test(line)
    || RE_FNDEF.test(line)
    || line.trimStart().startsWith('|')
  );
}

function parseBlocks(lines, ctx) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // Heading
    const h = RE_HEADING.exec(line);
    if (h) {
      const text = h[2].replace(/\s+#+\s*$/, '').trim();
      const depth = h[1].length;
      const id = ctx.headingId(text);
      out.push({ t: 'h', d: depth, id, text: plainText(parseInline(text, ctx.resolve)), c: parseInline(text, ctx.resolve) });
      ctx.toc.push({ id, depth, text: plainText(parseInline(text, ctx.resolve)) });
      i += 1;
      continue;
    }

    // Thematic break
    if (RE_HR.test(line)) { out.push({ t: 'hr' }); i += 1; continue; }

    // Fenced code
    const f = RE_FENCE.exec(line);
    if (f) {
      const fence = f[1][0].repeat(3);
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) { body.push(lines[i]); i += 1; }
      i += 1; // closing fence
      out.push({ t: 'code', lang: f[2] || '', v: body.join('\n') });
      continue;
    }

    // Footnote definition — pulled out of the flow and rendered in the
    // footnotes rail at the foot of the article.
    const fn = RE_FNDEF.exec(line);
    if (fn) {
      const body = [fn[2]];
      i += 1;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { body.push(lines[i].trim()); i += 1; }
      ctx.footnotes.push({ id: fn[1], c: parseInline(body.join(' ').trim(), ctx.resolve) });
      continue;
    }

    // Blockquote / Obsidian callout
    if (RE_QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) { inner.push(RE_QUOTE.exec(lines[i])[1]); i += 1; }
      let kind = null;
      let title = null;
      const co = RE_CALLOUT.exec(inner[0] || '');
      if (co) { kind = co[1].toLowerCase(); title = co[2].trim() || co[1]; inner.shift(); }
      out.push({ t: 'quote', kind, title, c: parseBlocks(inner, ctx) });
      continue;
    }

    // GFM pipe table — needs the delimiter row to avoid eating stray pipes.
    if (line.trimStart().startsWith('|') && isDelimiterRow(lines[i + 1])) {
      const head = splitRow(line).map((c) => parseInline(c, ctx.resolve));
      const align = splitRow(lines[i + 1]).map(cellAlign);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        rows.push(splitRow(lines[i]).map((c) => parseInline(c, ctx.resolve)));
        i += 1;
      }
      out.push({ t: 'table', head, align, rows });
      continue;
    }

    // Lists
    if (RE_UL.test(line) || RE_OL.test(line)) {
      const [list, next] = parseList(lines, i, ctx);
      out.push(list);
      i = next;
      continue;
    }

    // Paragraph
    const para = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i].trim()); i += 1; }
    out.push({ t: 'p', c: parseInline(para.join(' '), ctx.resolve) });
  }

  return out;
}

function indentOf(line) {
  return /^(\s*)/.exec(line)[1].replace(/\t/g, '  ').length;
}

/** Parse one list (with nesting) starting at `start`; returns [node, nextIndex]. */
function parseList(lines, start, ctx) {
  const ordered = RE_OL.test(lines[start]);
  const baseIndent = indentOf(lines[start]);
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const m = (ordered ? RE_OL : RE_UL).exec(line);
    const other = (ordered ? RE_UL : RE_OL).exec(line);
    if (!m || indentOf(line) !== baseIndent) {
      // A sibling of a different kind, or dedent, ends this list.
      if (other && indentOf(line) === baseIndent) break;
      break;
    }

    const own = [m[2]];
    i += 1;
    const children = [];
    while (i < lines.length) {
      const nxt = lines[i];
      if (!nxt.trim()) break;
      const ind = indentOf(nxt);
      if (ind > baseIndent && (RE_UL.test(nxt) || RE_OL.test(nxt))) {
        const [sub, next] = parseList(lines, i, ctx);
        children.push(sub);
        i = next;
        continue;
      }
      if (ind > baseIndent || !isBlockStart(nxt)) { own.push(nxt.trim()); i += 1; continue; }
      break;
    }
    items.push({ c: parseInline(own.join(' ').trim(), ctx.resolve), children });
  }

  return [{ t: ordered ? 'ol' : 'ul', items }, i];
}

function isDelimiterRow(line) {
  if (!line) return false;
  const t = line.trim();
  return t.startsWith('|') && /^\|?[\s:|-]+\|?$/.test(t) && t.includes('-');
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function cellAlign(spec) {
  const s = spec.trim();
  if (s.startsWith(':') && s.endsWith(':')) return 'center';
  if (s.endsWith(':')) return 'right';
  return 'left';
}

/** Visit every inline node in a block tree. */
export function walkInline(blocks, fn) {
  const inline = (nodes) => {
    for (const n of nodes || []) {
      fn(n);
      if (n.c) inline(n.c);
    }
  };
  for (const b of blocks || []) {
    inline(b.c);
    inline(b.caption);
    for (const it of b.items || []) { inline(it.c); walkInline(it.children, fn); }
    for (const cell of b.head || []) inline(cell);
    for (const row of b.rows || []) for (const cell of row) inline(cell);
    if (b.t === 'quote') walkInline(b.c, fn);
  }
}

/**
 * Number the footnotes in definition order and stamp that number onto every
 * reference, so the marker reads `[1]` the way an encyclopedia does instead of
 * exposing the vault's internal ids (`[^usgs]`, `[^resv]`). A reference with no
 * matching definition keeps its id, which is more useful than a dangling number.
 */
export function numberFootnotes(blocks, footnotes) {
  const n = new Map();
  footnotes.forEach((f, i) => { f.n = i + 1; n.set(f.id, i + 1); });
  walkInline(blocks, (node) => {
    if (node.t === 'fnref') node.n = n.get(node.id) ?? null;
  });
}

/** Flatten inline nodes to their readable text (ToC entries, summaries, titles). */
export function plainText(nodes) {
  if (!Array.isArray(nodes)) return '';
  return nodes.map((n) => {
    if (n.t === 'text' || n.t === 'codespan' || n.t === 'deadlink') return n.v;
    if (n.t === 'embed') return n.name;
    if (n.t === 'fnref' || n.t === 'img') return '';
    return plainText(n.c);
  }).join('');
}

/**
 * Fold `![[asset.ext]]` embeds — and the attribution line that follows them —
 * into a single `figure` block.
 *
 * The 447 attachments those embeds point at (Wikimedia lead photos, OSM road
 * SVGs, official park-map PDFs; 228 MiB) are NOT in the codex artifact and are
 * not planned for the next one. Rendering them as `<img>` would give every
 * article a row of broken images, so a figure renders as a named placeholder:
 * the reader is told exactly which asset is missing and what kind it is.
 *
 * The line beneath an image embed is almost always the photo credit
 * (`*Photo: Lowe, Jet, creator — Public domain, via Wikimedia Commons*`). That
 * line is the CC-BY / CC-BY-SA attribution that makes the image usable at all,
 * so it is never dropped — it is promoted to the figure's caption, where it
 * reads as a credit instead of a stray italic paragraph.
 */
export function foldFigures(blocks) {
  const solid = (nodes) => nodes.filter((n) => !(n.t === 'text' && !n.v.trim()));

  // In the vault the embed and its credit sit on ADJACENT lines, so they parse
  // into one paragraph — but a blank line between them is just as common. Both
  // shapes have to fold, so a figure is "leading embeds, then nothing or a
  // single emphasised run", looked for inside the paragraph first and in the
  // next paragraph second.
  const split = (b) => {
    if (!b || b.t !== 'p') return null;
    const nodes = solid(b.c);
    const assets = [];
    let i = 0;
    while (i < nodes.length && nodes[i].t === 'embed') { assets.push(nodes[i].name); i += 1; }
    if (!assets.length) return null;
    const rest = nodes.slice(i);
    if (rest.length === 0) return { assets, caption: null };
    if (rest.length === 1 && rest[0].t === 'em') return { assets, caption: rest[0].c };
    return null; // an embed used mid-sentence — leave the paragraph alone.
  };

  const isCaptionPara = (b) => {
    if (!b || b.t !== 'p') return false;
    const nodes = solid(b.c);
    return nodes.length === 1 && nodes[0].t === 'em';
  };

  const out = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const fig = split(b);
    if (!fig) { out.push(b); continue; }
    if (!fig.caption && isCaptionPara(blocks[i + 1])) {
      fig.caption = solid(blocks[i + 1].c)[0].c;
      i += 1;
    }
    out.push({ t: 'figure', assets: fig.assets, caption: fig.caption });
  }
  return out;
}

/** `heading-adams-fork.jpg` → a human label + a coarse kind for the placeholder. */
export function describeAsset(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return { kind: 'map', label: 'Park map (PDF)' };
  if (ext === 'svg') return { kind: 'diagram', label: 'Road diagram (SVG)' };
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return { kind: 'photo', label: 'Photograph' };
  return { kind: 'file', label: 'Attachment' };
}

/**
 * Parse a whole note body.
 *
 * @param {string} src            markdown, frontmatter already stripped
 * @param {object} [opts]
 * @param {(target:string)=>string|null} [opts.resolve]  wikilink resolver
 * @param {boolean} [opts.dropTitle]  drop a leading `# Title` (the page renders
 *   its own H1 from the structured `name`, so keeping it would double it up)
 * @returns {{blocks: object[], toc: object[], footnotes: object[], title: string|null}}
 */
export function parseMarkdown(src, opts = {}) {
  const { resolve = () => null, dropTitle = false } = opts;
  const seen = new Map();
  const ctx = {
    resolve,
    toc: [],
    footnotes: [],
    headingId(text) {
      const base = slugify(text) || 'section';
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return n === 1 ? base : `${base}-${n}`;
    },
  };

  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  let blocks = foldFigures(parseBlocks(lines, ctx));
  let title = null;

  if (blocks.length && blocks[0].t === 'h' && blocks[0].d === 1) {
    title = blocks[0].text;
    if (dropTitle) {
      blocks = blocks.slice(1);
      ctx.toc.shift();
    }
  }

  numberFootnotes(blocks, ctx.footnotes);

  return { blocks, toc: ctx.toc, footnotes: ctx.footnotes, title };
}

/** First paragraph, trimmed to ~`max` chars — the index card's dek. */
export function summarize(blocks, max = 220) {
  const p = blocks.find((b) => b.t === 'p');
  if (!p) return '';
  const text = plainText(p.c).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
