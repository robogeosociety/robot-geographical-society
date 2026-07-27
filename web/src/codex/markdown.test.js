import {
  describeAsset, foldFigures, parseInline, parseMarkdown, plainText, slugify, summarize, wikilinkNode,
} from './markdown.js';

const resolve = (t) => (t === 'Adams Fork' ? '/codex/adams-fork' : null);

describe('slugify', () => {
  it('folds names to stable anchors', () => {
    expect(slugify('Adams Fork')).toBe('adams-fork');
    expect(slugify('Weather & winter')).toBe('weather-and-winter');
    expect(slugify("Heart O' the Hills")).toBe('heart-o-the-hills');
  });
});

describe('wikilinks', () => {
  it('links a target the codex carries', () => {
    expect(wikilinkNode('Adams Fork', resolve)).toEqual({
      t: 'wikilink', to: '/codex/adams-fork', c: [{ t: 'text', v: 'Adams Fork' }],
    });
  });

  it('renders an unknown target as plain text, never a dead link', () => {
    const n = wikilinkNode('Weather & winter', resolve);
    expect(n.t).toBe('deadlink');
    expect(n.v).toBe('Weather & winter');
  });

  it('honours an alias on both resolved and unresolved links', () => {
    expect(plainText([wikilinkNode('Adams Fork|the Cispus camp', resolve)])).toBe('the Cispus camp');
    expect(plainText([wikilinkNode('Bear country|bears', resolve)])).toBe('bears');
  });

  it('carries a heading anchor through to the target article', () => {
    expect(wikilinkNode('Adams Fork#Hazards', resolve).to).toBe('/codex/adams-fork#hazards');
  });

  it('treats [[#Heading]] as a same-article jump', () => {
    expect(wikilinkNode('#Hazards', resolve)).toMatchObject({ t: 'link', href: '#hazards' });
  });
});

describe('inline', () => {
  it('parses emphasis, code and external links', () => {
    const nodes = parseInline('**bold** and *soft* and `code` and [rec](https://x.test/a)', resolve);
    expect(nodes.map((n) => n.t)).toEqual(['strong', 'text', 'em', 'text', 'codespan', 'text', 'link']);
    expect(nodes.at(-1).href).toBe('https://x.test/a');
  });

  it('parses footnote references', () => {
    expect(parseInline('elevation[^usgs]').at(-1)).toEqual({ t: 'fnref', id: 'usgs' });
  });

  it('numbers footnote references in definition order', () => {
    const { blocks, footnotes } = parseMarkdown(
      'Elevation[^usgs] and reservations[^resv].\n\n[^usgs]: USGS.\n[^resv]: rec.gov.\n',
    );
    const refs = blocks[0].c.filter((n) => n.t === 'fnref');
    expect(refs.map((r) => [r.id, r.n])).toEqual([['usgs', 1], ['resv', 2]]);
    expect(footnotes.map((f) => f.n)).toEqual([1, 2]);
  });

  it('leaves a reference with no definition unnumbered rather than dangling', () => {
    const { blocks } = parseMarkdown('Claim[^ghost].');
    expect(blocks[0].c.find((n) => n.t === 'fnref')).toMatchObject({ id: 'ghost', n: null });
  });

  it('distinguishes an ![[embed]] from a [[link]]', () => {
    expect(parseInline('![[roads.svg]]')[0]).toEqual({ t: 'embed', name: 'roads.svg' });
    expect(parseInline('[[Adams Fork]]', resolve)[0].t).toBe('wikilink');
  });
});

describe('blocks', () => {
  const body = `# Adams Fork

Intro prose linking [[Adams Fork]] and [[Gifford Pinchot NF]].[^usgs]

## Access

- From Randle
- From Trout Lake
  - gated by snow

> [!warning] No potable water
> Bring what you need.

| Hazard | Tier |
| --- | :--- |
| lahar | distal |

[^usgs]: USGS 3DEP.
`;

  const doc = parseMarkdown(body, { resolve, dropTitle: true });

  it('drops the duplicated H1 and reports it as the title', () => {
    expect(doc.title).toBe('Adams Fork');
    expect(doc.blocks[0].t).toBe('p');
  });

  it('builds a table of contents from the headings', () => {
    expect(doc.toc).toEqual([{ id: 'access', depth: 2, text: 'Access' }]);
  });

  it('collects footnote definitions out of the flow', () => {
    expect(doc.footnotes.map((f) => f.id)).toEqual(['usgs']);
    expect(doc.blocks.some((b) => b.t === 'fndef')).toBe(false);
  });

  it('parses a nested list', () => {
    const ul = doc.blocks.find((b) => b.t === 'ul');
    expect(ul.items).toHaveLength(2);
    expect(ul.items[1].children[0].items[0].c[0].v).toBe('gated by snow');
  });

  it('parses an Obsidian callout with its kind and title', () => {
    const q = doc.blocks.find((b) => b.t === 'quote');
    expect(q).toMatchObject({ kind: 'warning', title: 'No potable water' });
  });

  it('parses a GFM table with alignment', () => {
    const t = doc.blocks.find((b) => b.t === 'table');
    expect(plainText(t.head[0])).toBe('Hazard');
    expect(t.align).toEqual(['left', 'left']);
    expect(plainText(t.rows[0][1])).toBe('distal');
  });

  it('gives duplicate headings distinct anchors', () => {
    const { toc } = parseMarkdown('## Map\n\ntext\n\n## Map\n');
    expect(toc.map((h) => h.id)).toEqual(['map', 'map-2']);
  });
});

describe('figures', () => {
  it('folds an embed and the credit line on the NEXT line into one figure', () => {
    const { blocks } = parseMarkdown('![[heading-adams-fork.jpg]]\n*Photo: Lowe, Jet — Public domain*\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ t: 'figure', assets: ['heading-adams-fork.jpg'] });
    expect(plainText(blocks[0].caption)).toBe('Photo: Lowe, Jet — Public domain');
  });

  it('folds an embed and a credit separated by a blank line', () => {
    const { blocks } = parseMarkdown('![[a.jpg]]\n\n*Photo: someone — CC BY 2.0*\n');
    expect(blocks).toHaveLength(1);
    expect(plainText(blocks[0].caption)).toBe('Photo: someone — CC BY 2.0');
  });

  it('never drops an attribution line', () => {
    const { blocks } = parseMarkdown('![[a.jpg]]\n*CC BY-SA 4.0, via Wikimedia Commons*\n');
    expect(plainText(blocks[0].caption)).toContain('CC BY-SA 4.0');
  });

  it('groups consecutive embeds and tolerates a missing credit', () => {
    const { blocks } = parseMarkdown('![[roads.svg]]\n![[map.pdf]]\n');
    expect(blocks[0]).toEqual({ t: 'figure', assets: ['roads.svg', 'map.pdf'], caption: null });
  });

  it('is idempotent — folding an already-folded block list changes nothing', () => {
    const { blocks } = parseMarkdown('![[a.jpg]]\n*credit*\n');
    expect(foldFigures(blocks)).toEqual(blocks);
  });

  it('leaves an embed used mid-sentence alone', () => {
    const { blocks } = parseMarkdown('See ![[map.pdf]] for the layout.');
    expect(blocks[0].t).toBe('p');
  });

  it('labels an asset by extension', () => {
    expect(describeAsset('map-ocean-city.pdf').kind).toBe('map');
    expect(describeAsset('roads.svg').kind).toBe('diagram');
    expect(describeAsset('heading.jpg').kind).toBe('photo');
  });
});

describe('summarize', () => {
  it('takes the first paragraph and trims on a word boundary', () => {
    const { blocks } = parseMarkdown('# T\n\n' + 'word '.repeat(80));
    const s = summarize(blocks, 40);
    expect(s.length).toBeLessThanOrEqual(41);
    expect(s.endsWith('…')).toBe(true);
  });

  it('skips a leading figure to find the prose', () => {
    const { blocks } = parseMarkdown('# T\n\n![[a.jpg]]\n*credit*\n\nThe real opening line.\n');
    expect(summarize(blocks)).toBe('The real opening line.');
  });
});
