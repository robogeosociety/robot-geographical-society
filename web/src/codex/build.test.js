import {
  NON_ARTICLE_REFERENCES, buildCodex, buildResolver, compareSiteLabels, filterCampgrounds, groupLoops,
} from './build.js';

const CG = [
  {
    slug: 'adams-fork',
    name: 'Adams Fork',
    guid: 'dec6235f-1c72-5fd6-abc0-d9c67fff8c51',
    agency: 'usfs',
    agency_full: 'US Forest Service',
    unit: 'Gifford Pinchot NF',
    lat: 46.34,
    lng: -121.54,
    elev_m: 1280,
    reservable: 1,
    hazards: '["weather","wildfire","lahar"]',
    official_url: 'https://www.recreation.gov/camping/campgrounds/232473',
    body: '# Adams Fork\n\nBelow [[Takhlakh Lake]], in the [[Gifford Pinchot NF]]; see [[Travel times]].\n\n## Access\n\nFR-21.\n',
    site_count: 3,
    updated: '2026-07-24T09:12:00Z',
  },
  {
    slug: 'takhlakh-lake',
    name: 'Takhlakh Lake',
    guid: null, // no inventory row — expected for 36 of the 192
    agency: 'usfs',
    hazards: '["weather"]',
    body: '# Takhlakh Lake\n\nThe reflection view.\n',
    site_count: 0,
    updated: '2026-07-24T09:12:00Z',
  },
];

const REFS = [
  {
    slug: 'gifford-pinchot-nf',
    name: 'Gifford Pinchot NF',
    body: '# Gifford Pinchot NF\n\nThe south Cascades.\n\n## Campgrounds\n\n[[Adams Fork]], [[Takhlakh Lake]]\n',
    updated: '2026-07-24T09:12:00Z',
  },
  {
    slug: 'campsite-template',
    name: 'Campsite template',
    body: '# Campsite template\n\n## Access\n',
    updated: '2026-07-24T09:12:00Z',
  },
];

// `site_slug` is the artifact's routing key: the label when it is unique inside
// the campground, else `<label>-<provider_site_id>`.
const SITES = [
  { id: 1, campground_slug: 'adams-fork', site: '002', site_slug: '002', loop: 'AREA ADAMS FORK', type: 'STANDARD NONELECTRIC', use: 'Overnight', reservable: 1, provider_site_id: '82922', official_url: 'https://x.test/1', body: '# Adams Fork — 002\n\n> Site 002 at [[Adams Fork]].\n', updated: 'u' },
  { id: 2, campground_slug: 'adams-fork', site: '011', site_slug: '011', loop: 'AREA ADAMS FORK', type: 'STANDARD NONELECTRIC', use: 'Overnight', reservable: 1, provider_site_id: '82923', official_url: 'https://x.test/2', body: '# Adams Fork — 011\n\n> Site 011 at [[Adams Fork]].\n', updated: 'u' },
  { id: 3, campground_slug: 'adams-fork', site: '100', site_slug: '100', loop: 'AREA ADAMS FORK', type: null, use: null, reservable: 1, provider_site_id: '82924', official_url: null, body: '# Adams Fork — 100\n', updated: 'u' },
];

describe('buildResolver', () => {
  const resolve = buildResolver(CG, REFS);

  it('resolves a campground by name and by slug', () => {
    expect(resolve('Adams Fork')).toBe('/codex/adams-fork');
    expect(resolve('adams-fork')).toBe('/codex/adams-fork');
  });

  it('folds punctuation and case', () => {
    expect(resolve('  takhlakh lake ')).toBe('/codex/takhlakh-lake');
  });

  it('takes the leaf of a foldered link', () => {
    expect(resolve('Campsites/Adams Fork')).toBe('/codex/adams-fork');
  });

  it('falls through to the reference tier', () => {
    expect(resolve('Gifford Pinchot NF')).toBe('/codex/reference/gifford-pinchot-nf');
  });

  it('prefers a campground over a reference of the same name', () => {
    const r = buildResolver(
      [{ slug: 'wildlife-cg', name: 'Wildlife' }],
      [{ slug: 'wildlife', name: 'Wildlife' }],
    );
    expect(r('Wildlife')).toBe('/codex/wildlife-cg');
  });

  it('never resolves the note template', () => {
    expect(NON_ARTICLE_REFERENCES.has('campsite-template')).toBe(true);
    expect(resolve('Campsite template')).toBeNull();
    expect(resolve('campsite-template')).toBeNull();
  });

  it('returns null for a note in neither table', () => {
    expect(resolve('Travel times')).toBeNull();
  });

  it('refuses an ambiguous target rather than guessing', () => {
    const r = buildResolver([
      { slug: 'a-lake', name: 'Twin Lake' },
      { slug: 'b-lake', name: 'Twin Lake' },
    ]);
    expect(r('Twin Lake')).toBeNull();
    expect(r('a-lake')).toBe('/codex/a-lake');
  });
});

describe('site ordering', () => {
  it('keeps zero-padded labels in human order', () => {
    expect(['011', '002', '100'].sort(compareSiteLabels)).toEqual(['002', '011', '100']);
  });

  it('does not fall into 1, 10, 100, 2 on unpadded labels', () => {
    expect(['1', '10', '100', '2'].sort(compareSiteLabels)).toEqual(['1', '2', '10', '100']);
  });
});

describe('groupLoops', () => {
  it("routes on the artifact's site_slug, not on the label", () => {
    const sites = [
      { id: 1, site: '001', site_slug: '001-80131', loop: 'A' },
      { id: 2, site: '001', site_slug: '001-80767', loop: 'B' },
    ];
    const loops = groupLoops(sites);
    expect(loops.map((l) => l.name)).toEqual(['A', 'B']);
    expect(loops.flatMap((l) => l.sites.map((s) => s.key))).toEqual(['001-80131', '001-80767']);
  });

  it('buckets a NULL loop under one Ungrouped loop', () => {
    const sites = [
      { id: 1, site: '1', site_slug: '1', loop: null },
      { id: 2, site: '2', site_slug: '2', loop: null },
    ];
    const loops = groupLoops(sites);
    expect(loops).toHaveLength(1);
    expect(loops[0].name).toBe('Ungrouped');
  });
});

describe('buildCodex', () => {
  const out = buildCodex(
    { campgrounds: CG, sites: SITES, references: REFS },
    { generated: '2026-07-26T00:00:00Z' },
  );

  it('indexes every campground with parsed hazards and section headings', () => {
    expect(out.index.counts).toMatchObject({ campgrounds: 2, sites: 3, references: 1 });
    const af = out.index.campgrounds.find((c) => c.slug === 'adams-fork');
    expect(af.hazards).toEqual(['weather', 'wildfire', 'lahar']);
    expect(af.headings).toEqual(['Access']);
  });

  it("carries the artifact's guid through, and tolerates its absence", () => {
    const rows = out.index.campgrounds;
    expect(rows.find((c) => c.slug === 'adams-fork').guid).toBe('dec6235f-1c72-5fd6-abc0-d9c67fff8c51');
    expect(rows.find((c) => c.slug === 'takhlakh-lake').guid).toBeNull();
  });

  it('emits no body in the index (that is the whole point of the split)', () => {
    expect(out.index.campgrounds[0].body).toBeUndefined();
  });

  it('resolves a cross-reference between two campground articles', () => {
    const af = out.articles.get('adams-fork');
    const link = af.body.flatMap((b) => b.c || []).find((n) => n.to === '/codex/takhlakh-lake');
    expect(link).toBeDefined();
  });

  it('links a campground body up into the reference tier', () => {
    const af = out.articles.get('adams-fork');
    const link = af.body.flatMap((b) => b.c || []).find((n) => n.to === '/codex/reference/gifford-pinchot-nf');
    expect(link).toBeDefined();
  });

  it('leaves a note in neither table as plain text', () => {
    const af = out.articles.get('adams-fork');
    const dead = af.body.flatMap((b) => b.c || []).find((n) => n.t === 'deadlink');
    expect(dead.v).toBe('Travel times');
  });

  it('parses reference articles and links them back down to campgrounds', () => {
    const ref = out.referenceArticles.get('gifford-pinchot-nf');
    expect(ref.name).toBe('Gifford Pinchot NF');
    expect(ref.toc.map((h) => h.id)).toEqual(['campgrounds']);
    const links = ref.body.flatMap((b) => b.c || []).filter((n) => n.t === 'wikilink').map((n) => n.to);
    expect(links).toEqual(['/codex/adams-fork', '/codex/takhlakh-lake']);
  });

  it('keeps the note template out of the index and the article set', () => {
    expect(out.index.references.map((r) => r.slug)).toEqual(['gifford-pinchot-nf']);
    expect(out.referenceArticles.has('campsite-template')).toBe(false);
  });

  it('treats a campground with zero sites as a normal state', () => {
    const tl = out.articles.get('takhlakh-lake');
    expect(tl.loops).toEqual([]);
    expect(tl.sites_present).toBe(0);
  });

  it('records the count the record claims alongside what was exported', () => {
    const af = out.articles.get('adams-fork');
    expect(af.site_count).toBe(3);
    expect(af.sites_present).toBe(3);
  });

  it('bundles site bodies separately, keyed by site_slug', () => {
    const bundle = out.siteBundles.get('adams-fork');
    expect(Object.keys(bundle.sites).sort()).toEqual(['002', '011', '100']);
    // Site bodies are now the H1 and the blockquote — the restated metadata
    // bullets were dropped from the artifact.
    expect(bundle.sites['002'].body[0].t).toBe('quote');
  });

  it('sorts campgrounds alphabetically', () => {
    expect(out.index.campgrounds.map((c) => c.slug)).toEqual(['adams-fork', 'takhlakh-lake']);
  });

  it('still builds with no reference table at all', () => {
    const bare = buildCodex({ campgrounds: CG, sites: SITES });
    expect(bare.index.counts.references).toBe(0);
    expect(bare.index.references).toEqual([]);
    const af = bare.articles.get('adams-fork');
    expect(af.body.flatMap((b) => b.c || []).some((n) => n.t === 'deadlink' && n.v === 'Gifford Pinchot NF')).toBe(true);
  });
});

describe('filterCampgrounds', () => {
  const rows = buildCodex({ campgrounds: CG, sites: SITES, references: REFS }).index.campgrounds;

  it('matches free text across name, unit and section headings', () => {
    expect(filterCampgrounds(rows, { q: 'gifford' }).map((r) => r.slug)).toEqual(['adams-fork']);
    expect(filterCampgrounds(rows, { q: 'access' }).map((r) => r.slug)).toEqual(['adams-fork']);
  });

  it('facets by hazard and agency', () => {
    expect(filterCampgrounds(rows, { hazard: 'lahar' })).toHaveLength(1);
    expect(filterCampgrounds(rows, { agency: 'usfs' })).toHaveLength(2);
    expect(filterCampgrounds(rows, { agency: 'nps' })).toHaveLength(0);
  });

  it('combines facets with the query', () => {
    expect(filterCampgrounds(rows, { q: 'reflection', hazard: 'lahar' })).toHaveLength(0);
  });
});
