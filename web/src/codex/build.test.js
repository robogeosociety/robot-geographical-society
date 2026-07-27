import {
  buildCodex, buildResolver, compareSiteLabels, filterCampgrounds, groupLoops, joinInventory, siteKeys,
} from './build.js';

const CG = [
  {
    slug: 'adams-fork',
    name: 'Adams Fork',
    guid: null,
    agency: 'usfs',
    agency_full: 'US Forest Service',
    unit: 'Gifford Pinchot NF',
    lat: 46.34,
    lng: -121.54,
    elev_m: 1280,
    reservable: 1,
    hazards: '["weather","wildfire","lahar"]',
    official_url: 'https://www.recreation.gov/camping/campgrounds/232473',
    body: '# Adams Fork\n\nAt the confluence, below [[Takhlakh Lake]] and [[Weather & winter]].\n\n## Access\n\nFR-21.\n',
    site_count: 3,
    updated: '2026-07-24T09:12:00Z',
  },
  {
    slug: 'takhlakh-lake',
    name: 'Takhlakh Lake',
    agency: 'usfs',
    hazards: '["weather"]',
    body: '# Takhlakh Lake\n\nThe reflection view.\n',
    site_count: 0,
    updated: '2026-07-24T09:12:00Z',
  },
];

const SITES = [
  { id: 1, campground_slug: 'adams-fork', site: '002', loop: 'AREA ADAMS FORK', type: 'STANDARD NONELECTRIC', use: 'Overnight', reservable: 1, provider_site_id: '82922', official_url: 'https://x.test/1', body: '# Adams Fork — 002\n\n- **Campground:** [[Adams Fork]]\n', updated: 'u' },
  { id: 2, campground_slug: 'adams-fork', site: '011', loop: 'AREA ADAMS FORK', type: 'STANDARD NONELECTRIC', use: 'Overnight', reservable: 1, provider_site_id: '82923', official_url: 'https://x.test/2', body: '# Adams Fork — 011\n\n- **Campground:** [[Adams Fork]]\n', updated: 'u' },
  { id: 3, campground_slug: 'adams-fork', site: '100', loop: 'AREA ADAMS FORK', type: null, use: null, reservable: 1, provider_site_id: '82924', official_url: null, body: '# Adams Fork — 100\n', updated: 'u' },
];

describe('buildResolver', () => {
  const resolve = buildResolver(CG);

  it('resolves by name and by slug', () => {
    expect(resolve('Adams Fork')).toBe('/codex/adams-fork');
    expect(resolve('adams-fork')).toBe('/codex/adams-fork');
  });

  it('folds punctuation and case', () => {
    expect(resolve('  takhlakh lake ')).toBe('/codex/takhlakh-lake');
  });

  it('takes the leaf of a foldered link', () => {
    expect(resolve('Campsites/Adams Fork')).toBe('/codex/adams-fork');
  });

  it('returns null for a note the codex does not carry', () => {
    expect(resolve('Weather & winter')).toBeNull();
    expect(resolve('Gifford Pinchot NF')).toBeNull();
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

describe('site keys', () => {
  it('keys on the bare label when it is unique in the campground', () => {
    const keys = siteKeys(SITES);
    expect([...keys.values()]).toEqual(['002', '011', '100']);
  });

  it('disambiguates by loop when a label repeats across loops', () => {
    const dup = [
      { id: 1, site: '001', loop: 'CRANBERRY LAKE' },
      { id: 2, site: '001', loop: 'QUARRY POND' },
      { id: 3, site: '002', loop: 'CRANBERRY LAKE' },
    ];
    const keys = siteKeys(dup);
    expect(keys.get(1)).toBe('001--cranberry-lake');
    expect(keys.get(2)).toBe('001--quarry-pond');
    expect(keys.get(3)).toBe('002');
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
  it('buckets a NULL loop under one Ungrouped loop', () => {
    const sites = [{ id: 1, site: '1', loop: null }, { id: 2, site: '2', loop: null }];
    const loops = groupLoops(sites, siteKeys(sites));
    expect(loops).toHaveLength(1);
    expect(loops[0].name).toBe('Ungrouped');
  });
});

describe('joinInventory', () => {
  it('fills the NULL guid from the inventory by url, then by name', () => {
    const { campgrounds, matched } = joinInventory(CG, [
      { guid: 'g-af', name: 'Somewhere else', reservation_url: 'https://www.recreation.gov/camping/campgrounds/232473' },
      { guid: 'g-tl', name: 'Takhlakh Lake' },
    ]);
    expect(campgrounds[0].guid).toBe('g-af');
    expect(campgrounds[1].guid).toBe('g-tl');
    expect(matched).toBe(2);
  });

  it('leaves the guid null when nothing matches', () => {
    const { campgrounds, matched } = joinInventory(CG, []);
    expect(campgrounds.every((c) => c.guid === null)).toBe(true);
    expect(matched).toBe(0);
  });
});

describe('buildCodex', () => {
  const out = buildCodex({ campgrounds: CG, sites: SITES }, { generated: '2026-07-26T00:00:00Z' });

  it('indexes every campground with parsed hazards and a dek', () => {
    expect(out.index.counts).toMatchObject({ campgrounds: 2, sites: 3 });
    const af = out.index.campgrounds.find((c) => c.slug === 'adams-fork');
    expect(af.hazards).toEqual(['weather', 'wildfire', 'lahar']);
    expect(af.summary).toContain('At the confluence');
    expect(af.headings).toEqual(['Access']);
  });

  it('emits no body in the index (that is the whole point of the split)', () => {
    expect(out.index.campgrounds[0].body).toBeUndefined();
  });

  it('resolves a cross-reference between two codex articles', () => {
    const af = out.articles.get('adams-fork');
    const link = af.body.flatMap((b) => b.c || []).find((n) => n.t === 'wikilink');
    expect(link.to).toBe('/codex/takhlakh-lake');
  });

  it('leaves a reference note that is not in the codex as plain text', () => {
    const af = out.articles.get('adams-fork');
    const dead = af.body.flatMap((b) => b.c || []).find((n) => n.t === 'deadlink');
    expect(dead.v).toBe('Weather & winter');
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

  it('bundles site bodies separately from the article', () => {
    const bundle = out.siteBundles.get('adams-fork');
    expect(Object.keys(bundle.sites).sort()).toEqual(['002', '011', '100']);
    expect(bundle.sites['002'].body[0].t).toBe('ul');
  });

  it('sorts campgrounds alphabetically', () => {
    expect(out.index.campgrounds.map((c) => c.slug)).toEqual(['adams-fork', 'takhlakh-lake']);
  });
});

describe('filterCampgrounds', () => {
  const rows = buildCodex({ campgrounds: CG, sites: SITES }).index.campgrounds;

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
