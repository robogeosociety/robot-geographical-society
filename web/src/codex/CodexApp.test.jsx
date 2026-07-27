import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CodexApp from './CodexApp.jsx';
import { buildCodex } from './build.js';
import { _resetCodexCache } from './data.js';

// Build the fixtures through the REAL build pipeline, so these tests exercise
// the same JSON the build script writes rather than a hand-written stand-in.
const CG = [
  {
    slug: 'adams-fork',
    name: 'Adams Fork',
    agency: 'usfs',
    agency_full: 'US Forest Service',
    guid: 'dec6235f-1c72-5fd6-abc0-d9c67fff8c51',
    unit: 'Gifford Pinchot NF',
    lat: 46.3411,
    lng: -121.5442,
    elev_m: 1280,
    reservable: 1,
    hazards: '["weather","lahar"]',
    official_url: 'https://www.recreation.gov/camping/campgrounds/232473',
    body: '# Adams Fork\n\n![[heading-adams-fork.jpg]]\n*Photo: Lowe, Jet — Public domain*\n\nAt the confluence, near [[Takhlakh Lake]], in the [[Gifford Pinchot NF]]; see [[Travel times]].\n\n## Access\n\nFR-21 from Randle.\n\n## Hazards\n\nLahar, distal.\n',
    site_count: 4,
    updated: '2026-07-24T09:12:00Z',
  },
  {
    slug: 'takhlakh-lake',
    name: 'Takhlakh Lake',
    agency: 'usfs',
    agency_full: 'US Forest Service',
    hazards: '["weather"]',
    body: '# Takhlakh Lake\n\nThe reflection view of Mount Adams.\n',
    site_count: 0,
    updated: '2026-07-24T09:12:00Z',
  },
  {
    slug: 'deception-pass',
    name: 'Deception Pass',
    agency: 'wa-state-parks',
    agency_full: 'Washington State Parks',
    hazards: '["tsunami"]',
    body: '# Deception Pass\n\nThe busiest park in the state.\n',
    site_count: 2,
    updated: '2026-07-24T09:12:00Z',
  },
];

// Site bodies are the H1 plus the blockquote — the exporter strips the metadata
// bullets that the structured facts strip already carries.
const SITES = [
  { id: 1, campground_slug: 'adams-fork', site: '002', site_slug: '002', loop: 'AREA ADAMS FORK', type: 'STANDARD NONELECTRIC', use: 'Overnight', reservable: 1, provider_site_id: '82921', official_url: 'https://www.recreation.gov/camping/campsites/82921', body: '# Adams Fork — 002\n\n> Site 002 in AREA ADAMS FORK at [[Adams Fork]].\n', updated: 'u' },
  { id: 2, campground_slug: 'adams-fork', site: '011', site_slug: '011', loop: 'AREA ADAMS FORK', type: 'STANDARD NONELECTRIC', use: 'Overnight', reservable: 1, provider_site_id: '82922', official_url: 'https://www.recreation.gov/camping/campsites/82922', body: '# Adams Fork — 011\n\n> Site 011 in AREA ADAMS FORK at [[Adams Fork]]. Canonical data from recreation.gov.\n', updated: 'u' },
  { id: 3, campground_slug: 'adams-fork', site: '012', site_slug: '012', loop: 'AREA ADAMS FORK', type: 'TENT ONLY NONELECTRIC', use: 'Overnight', reservable: 1, provider_site_id: '82923', official_url: null, body: '# Adams Fork — 012\n', updated: 'u' },
  // Colliding labels: the exporter appends the provider id to the site_slug.
  { id: 4, campground_slug: 'deception-pass', site: '001', site_slug: '001-80131', loop: 'CRANBERRY LAKE', type: null, use: null, reservable: 1, provider_site_id: '80131', official_url: null, body: '# Deception Pass — 001\n', updated: 'u' },
  { id: 5, campground_slug: 'deception-pass', site: '001', site_slug: '001-80767', loop: 'QUARRY POND', type: null, use: null, reservable: 1, provider_site_id: '80767', official_url: null, body: '# Deception Pass — 001 (Quarry Pond)\n', updated: 'u' },
];

const REFS = [
  {
    slug: 'gifford-pinchot-nf',
    name: 'Gifford Pinchot NF',
    body: '# Gifford Pinchot NF\n\nThe south Washington Cascades.\n\n## Campgrounds\n\n[[Adams Fork]], [[Takhlakh Lake]]\n',
    updated: '2026-07-24T09:12:00Z',
  },
  {
    slug: 'campsite-template',
    name: 'Campsite template',
    body: '# Campsite template\n\n## Access\n',
    updated: '2026-07-24T09:12:00Z',
  },
];

let built;
let missing; // when true, serve the "artifact not shipped" index

beforeEach(() => {
  built = buildCodex({ campgrounds: CG, sites: SITES, references: REFS }, { generated: '2026-07-26T00:00:00Z' });
  missing = false;
  _resetCodexCache();
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const u = String(url);
    if (u.endsWith('/codex-data/index.json')) {
      return jsonOk(missing
        ? { available: false, reason: 'no artifact at ./data/campsite-codex.db', counts: {}, campgrounds: [] }
        : built.index);
    }
    const site = /\/cg\/(.+)\.sites\.json$/.exec(u);
    if (site) return maybe(built.siteBundles.get(site[1]), u);
    const ref = /\/ref\/(.+)\.json$/.exec(u);
    if (ref) return maybe(built.referenceArticles.get(ref[1]), u);
    const cg = /\/cg\/(.+)\.json$/.exec(u);
    if (cg) return maybe(built.articles.get(cg[1]), u);
    return Promise.resolve({ ok: false, status: 404 });
  });
});
afterEach(() => vi.restoreAllMocks());

function jsonOk(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}
function maybe(body, u) {
  return body ? jsonOk(body) : Promise.resolve({ ok: false, status: 404, url: u });
}

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}><CodexApp /></MemoryRouter>);
}

describe('codex index', () => {
  it('lists every campground with its dek', async () => {
    renderAt('/codex');
    expect(await screen.findByRole('heading', { name: 'Campsite Codex' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Adams Fork' }).closest('a'))
      .toHaveAttribute('href', '/codex/adams-fork');
    expect(screen.getByText(/At the confluence/)).toBeInTheDocument();
    expect(screen.getByText('3 of 3 campgrounds')).toBeInTheDocument();
  });

  it('searches across name, unit and section headings', async () => {
    const user = userEvent.setup();
    renderAt('/codex');
    const box = await screen.findByRole('searchbox', { name: /search the codex/i });

    await user.type(box, 'gifford');
    await waitFor(() => expect(screen.getByText('1 of 3 campgrounds')).toBeInTheDocument());
    // Only Adams Fork's card survives (Takhlakh is merely NAMED in its dek).
    expect(screen.getByRole('heading', { level: 2, name: 'Adams Fork' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Takhlakh Lake' })).not.toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'reflection');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Takhlakh Lake' })).toBeInTheDocument());
  });

  it('facets by agency and by hazard', async () => {
    const user = userEvent.setup();
    renderAt('/codex');
    await screen.findByRole('heading', { name: 'Campsite Codex' });

    await user.click(screen.getByRole('button', { name: /WA State Parks/ }));
    await waitFor(() => expect(screen.getByText('1 of 3 campgrounds')).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: 'Deception Pass' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /WA State Parks/ })); // toggle off
    await user.click(screen.getByRole('button', { name: 'lahar' }));
    await waitFor(() => expect(screen.getByText('1 of 3 campgrounds')).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 2, name: 'Adams Fork' })).toBeInTheDocument();
  });

  it('says so honestly when the artifact is not in the build', async () => {
    missing = true;
    renderAt('/codex');
    expect(await screen.findByText(/is not present in\s+this build/)).toBeInTheDocument();
  });
});

describe('campground article', () => {
  it('renders the body, the infobox and the loop roster', async () => {
    renderAt('/codex/adams-fork');
    expect(await screen.findByRole('heading', { level: 1, name: /Adams Fork/ })).toBeInTheDocument();

    // Body prose + a resolved cross-reference to another article.
    expect(screen.getByRole('link', { name: 'Takhlakh Lake' })).toHaveAttribute('href', '/codex/takhlakh-lake');
    // ...a link up into the reference tier...
    expect(screen.getByRole('link', { name: 'Gifford Pinchot NF' }))
      .toHaveAttribute('href', '/codex/reference/gifford-pinchot-nf');
    // ...and a note in neither table, which stayed plain text.
    expect(screen.queryByRole('link', { name: 'Travel times' })).not.toBeInTheDocument();

    const box = within(screen.getByRole('complementary', { name: /Adams Fork facts/ }));
    expect(box.getByText('Gifford Pinchot NF')).toBeInTheDocument();
    expect(box.getByText('46.3411°N 121.5442°W')).toBeInTheDocument();
    expect(box.getByText('dec6235f-1c72-5fd6-abc0-d9c67fff8c51')).toBeInTheDocument();
    expect(box.getByText('lahar')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: '011' })).toHaveAttribute('href', '/codex/adams-fork/site/011');
  });

  it('builds a table of contents from the article headings', async () => {
    renderAt('/codex/adams-fork');
    const toc = within(await screen.findByRole('navigation', { name: 'Contents' }));
    expect(toc.getByRole('link', { name: 'Access' })).toHaveAttribute('href', '#access');
    expect(toc.getByRole('link', { name: /Sites \(3\)/ })).toBeInTheDocument();
  });

  it('does not nest a single-loop campground under a pointless loop level', async () => {
    renderAt('/codex/adams-fork');
    await screen.findByRole('link', { name: '011' });
    expect(screen.queryByRole('heading', { level: 3, name: /AREA ADAMS FORK/ })).not.toBeInTheDocument();
    expect(screen.getByText(/All sites are in AREA ADAMS FORK/)).toBeInTheDocument();
  });

  it('nests a genuinely multi-loop campground and disambiguates colliding labels', async () => {
    renderAt('/codex/deception-pass');
    expect(await screen.findByRole('heading', { level: 3, name: /CRANBERRY LAKE/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /QUARRY POND/ })).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: '001' }).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/codex/deception-pass/site/001-80131',
      '/codex/deception-pass/site/001-80767',
    ]);
  });

  it('treats a campground with no site pages as a normal state', async () => {
    renderAt('/codex/takhlakh-lake');
    expect(await screen.findByText(/No per-site pages/)).toBeInTheDocument();
  });

  it('explains a missing attachment rather than showing a broken image', async () => {
    const { container } = renderAt('/codex/adams-fork');
    await screen.findByRole('heading', { level: 1, name: /Adams Fork/ });
    expect(container.querySelector('.codex-body img')).toBeNull();
    expect(screen.getByText('heading-adams-fork.jpg')).toBeInTheDocument();
    expect(screen.getByText(/Photo: Lowe, Jet/)).toBeInTheDocument();
  });

  it('reports a slug the codex does not carry instead of hanging', async () => {
    renderAt('/codex/not-a-campground');
    expect(await screen.findByRole('heading', { name: 'Not in the codex' })).toBeInTheDocument();
  });
});

describe('reference notes', () => {
  it('lists the reference notes on the index, minus the note template', async () => {
    renderAt('/codex');
    const section = within(await screen.findByRole('region', { name: /Reference notes/i }));
    expect(section.getByRole('link', { name: /Gifford Pinchot NF/ }))
      .toHaveAttribute('href', '/codex/reference/gifford-pinchot-nf');
    expect(section.queryByText(/Campsite template/i)).not.toBeInTheDocument();
  });

  it('renders a reference article that links back down to campgrounds', async () => {
    renderAt('/codex/reference/gifford-pinchot-nf');
    expect(await screen.findByRole('heading', { level: 1, name: 'Gifford Pinchot NF' })).toBeInTheDocument();
    expect(screen.getByText('Shared reference note')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Adams Fork' })).toHaveAttribute('href', '/codex/adams-fork');
  });

  it('has no infobox — there is no structured row behind a reference', async () => {
    renderAt('/codex/reference/gifford-pinchot-nf');
    await screen.findByRole('heading', { level: 1, name: 'Gifford Pinchot NF' });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('drops the contents column when a note has nothing to list', async () => {
    // `Travel times` in the real corpus: a lede and one big table, no headings.
    built.referenceArticles.set('travel-times', {
      slug: 'travel-times', name: 'Travel times', updated: 'u', toc: [], footnotes: [],
      body: [{ t: 'p', c: [{ t: 'text', v: 'Origin: Seattle.' }] }],
    });
    const { container } = renderAt('/codex/reference/travel-times');
    expect(await screen.findByRole('heading', { level: 1, name: 'Travel times' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Contents' })).not.toBeInTheDocument();
    expect(container.querySelector('.codex-layout-notoc')).not.toBeNull();
  });

  it('reports a reference slug the codex does not carry', async () => {
    renderAt('/codex/reference/campsite-template');
    expect(await screen.findByRole('heading', { name: 'Not in the codex' })).toBeInTheDocument();
  });
});

describe('site page', () => {
  it('renders the site body, its facts and breadcrumbs back up', async () => {
    renderAt('/codex/adams-fork/site/011');
    expect(await screen.findByRole('heading', { level: 1, name: /Adams Fork 011/ })).toBeInTheDocument();
    expect(screen.getByText(/Canonical data from recreation.gov/)).toBeInTheDocument();
    expect(screen.getByText('STANDARD NONELECTRIC')).toBeInTheDocument();

    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(crumbs.getByRole('link', { name: 'Codex' })).toHaveAttribute('href', '/codex');
    expect(crumbs.getByRole('link', { name: 'Adams Fork' })).toHaveAttribute('href', '/codex/adams-fork');
  });

  it('pages to the previous and next site in the loop', async () => {
    renderAt('/codex/adams-fork/site/011');
    const pager = within(await screen.findByRole('navigation', { name: /Sites in this loop/ }));
    expect(pager.getByRole('link', { name: /002/ })).toHaveAttribute('href', '/codex/adams-fork/site/002');
    expect(pager.getByRole('link', { name: /012/ })).toHaveAttribute('href', '/codex/adams-fork/site/012');
  });

  it('resolves the site body wikilink back to its campground', async () => {
    const { container } = renderAt('/codex/adams-fork/site/011');
    await screen.findByRole('heading', { level: 1, name: /Adams Fork 011/ });
    // Scoped to the prose — the breadcrumb carries the same label.
    const body = within(container.querySelector('.codex-body'));
    expect(body.getByRole('link', { name: 'Adams Fork' })).toHaveAttribute('href', '/codex/adams-fork');
  });

  it('reports an unknown site key', async () => {
    renderAt('/codex/adams-fork/site/999');
    expect(await screen.findByRole('heading', { name: 'No such site' })).toBeInTheDocument();
  });
});
