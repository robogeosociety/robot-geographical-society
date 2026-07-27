/**
 * Fixture seed for the campsite codex.
 *
 * The real artifact (192 campgrounds / 9,205 sites / 6.9 MB) is a vault export
 * that is not in this repo, so development and screenshots run against a small
 * stand-in built from this seed by `make-codex-fixture.js`. The seed is TEXT,
 * not a committed binary, so the fixture stays reviewable and reproducible.
 *
 * It is deliberately shaped to hit the awkward cases the real export contains:
 *
 *   - a very rich body (headings, GFM table, callout, footnotes, `![[embeds]]`
 *     with attribution lines, wikilinks to both known and unknown notes)
 *   - a campground with ZERO sites (the codex only covered reservable
 *     recreation.gov campgrounds)
 *   - a single-loop campground (must not render a pointless nesting level)
 *   - a multi-loop campground whose site labels COLLIDE across loops
 *   - NULL loops, NULL types, non-reservable campgrounds
 *   - zero-padded string site labels
 */

const ADAMS_FORK_BODY = `# Adams Fork

![[heading-adams-fork.jpg]]
*Photo: Lowe, Jet, creator — Public domain, via Wikimedia Commons*

Adams Fork sits at the confluence of the Cispus River and Adams Creek on the
south flank of [[Mount Adams|Mount Adams]], deep in the [[Gifford Pinchot NF]].
It is the last developed campground before the Cispus road climbs toward Takh
Takh Meadow, and its twenty-four sites are strung along a single loop under an
old-growth canopy of Douglas fir and western red cedar.[^usgs]

The campground is a classic Forest Service build of the mid-1960s: gravel spurs,
steel fire rings, vault toilets, and no potable water. That last detail governs
every trip here — the Cispus runs cold and clear past the campground, but it
drains glaciated terrain and carries rock flour, so filters clog fast.

## Access

The approach is Forest Road 21 from Randle, paved to the Cispus Learning Center
and then washboarded gravel for the last eleven miles. Trailers over 22 feet are
a poor idea; the turnaround at the loop head is tight and the spur grades are
steep enough to drag a long overhang.

- **From Randle:** US-12 to FR-23, then FR-21 east — about 45 minutes.
- **From Trout Lake:** FR-23 north over Babyshoe Pass, gated by snow into June.
- **Nearest fuel:** Randle, 28 miles.

> [!warning] No potable water
> There is no water system. Bring what you need or plan to treat river water —
> and expect a glacial-silt load that will blind a ceramic filter in a day.

## Map

![[roads-adams-fork.svg]]

## Hazards

Adams Fork carries five of the six hazard tokens. The lahar exposure is the one
that shapes siting: the campground lies 31 km from the summit of Mount Adams,
just outside the proximal ring, on a valley floor that has carried debris flows
before.[^lahar]

| Hazard | Tier | What it means here |
| --- | --- | --- |
| weather | alpine | 4,200 ft; hard freezes possible in any month |
| wildfire | high | East-Cascades fuels, closures common after August |
| wildlife | bear canister | Black bear active; hang or canister required |
| water | creek | Cispus River and Adams Creek both run through camp |
| lahar | distal | 31 km from Mount Adams, outside the 30 km ring |

Winter conditions are covered in [[Weather & winter]]; the general bear protocol
lives in [[Bear country]].

## Nearby

- [[Takhlakh Lake]] — 9 miles east, the reflection view of Mount Adams
- [[Olallie Lake]] — small, quiet, first-come
- [[Council Lake]] — rough road, no trailers

## Sources

| Source | Retrieved | Note |
| --- | --- | --- |
| USGS National Map | 2026-05-14 | Elevation, hydrography |
| recreation.gov | 2026-06-02 | Site inventory, loop names |
| GPNF Recreation Notice | 2026-04-30 | Seasonal road status |

[^usgs]: USGS 3DEP 1/3 arc-second DEM, sampled at the campground centroid.
[^lahar]: Haversine distance to the Mount Adams summit (46.2024, −121.4906).
[^resv]: recreation.gov facility 82922; reservable mid-June through late September.
`;

const DECEPTION_PASS_BODY = `# Deception Pass

![[heading-deception-pass.jpg]]
*Photo: Sam Beebe — CC BY 2.0, via Wikimedia Commons*

Deception Pass is the busiest state park in Washington and, with 354 campsites
across three campgrounds, the largest single booking surface in this codex. The
park straddles the strait between Whidbey and Fidalgo islands; the 1935 bridge
over the pass is the reason most visitors come, and the reason the shoulder
season is nearly as busy as July.

## Access

State Route 20 runs straight through the park. Cranberry Lake and Bowman Bay
have separate entrances; the Quarry Pond loop opens later in the season.

> [!note] Reservation window
> Washington State Parks releases sites on a rolling nine-month window, and the
> waterfront loops at Cranberry Lake clear within minutes of release.

## Hazards

Tsunami exposure is the notable one: the Cranberry Lake loops sit under 10 m of
elevation within 400 m of saltwater, which puts them in the high tier.[^tsunami]

## Nearby

- [[Fort Ebey]] — 20 miles south on Whidbey
- [[Bowman Bay]] — inside the park, walk-in

[^tsunami]: Elevation from USGS NED 10 m; shoreline distance from Natural Earth
10 m coastline. Interim tiering — refine against official inundation polygons.
`;

/** A serviceable body for the campgrounds that do not need bespoke prose. */
function genericBody({ name, unit, agencyFull, elevFt, blurb, neighbours }) {
  return `# ${name}

${blurb}

## Access

${name} is managed by ${agencyFull}${unit ? ` as part of ${unit}` : ''}. The
approach road is paved to the entrance and the loops are gravel; sites are
first-come outside the reservable season.

## Hazards

At roughly ${elevFt} ft, ${name} sees the usual Cascade weather swings — the
general guidance is in [[Weather & winter]].

## Nearby

${neighbours.map((n) => `- [[${n}]]`).join('\n')}

## Sources

| Source | Retrieved | Note |
| --- | --- | --- |
| recreation.gov | 2026-06-02 | Site inventory |
| Agency recreation page | 2026-05-20 | Season dates |
`;
}

const CAMPGROUNDS = [
  {
    slug: 'adams-fork',
    name: 'Adams Fork',
    agency: 'usfs',
    agency_full: 'US Forest Service',
    unit: 'Gifford Pinchot NF',
    lat: 46.3411,
    lng: -121.5442,
    elev_m: 1280,
    reservable: 1,
    hazards: ['weather', 'wildfire', 'wildlife', 'water', 'lahar'],
    official_url: 'https://www.recreation.gov/camping/campgrounds/232473',
    body: ADAMS_FORK_BODY,
    loops: ['AREA ADAMS FORK'],
    siteCount: 24,
  },
  {
    slug: 'deception-pass',
    name: 'Deception Pass',
    agency: 'wa-state-parks',
    agency_full: 'Washington State Parks',
    unit: 'Deception Pass State Park',
    lat: 48.3959,
    lng: -122.6455,
    elev_m: 18,
    reservable: 1,
    hazards: ['weather', 'wildlife', 'water', 'tsunami'],
    official_url: 'https://washington.goingtocamp.com/DeceptionPassPark',
    body: DECEPTION_PASS_BODY,
    // Colliding labels across loops — exercises the site-key disambiguation.
    loops: ['CRANBERRY LAKE', 'QUARRY POND', 'BOWMAN BAY'],
    siteCount: 60,
    collide: true,
  },
  {
    slug: 'takhlakh-lake',
    name: 'Takhlakh Lake',
    agency: 'usfs',
    agency_full: 'US Forest Service',
    unit: 'Gifford Pinchot NF',
    lat: 46.2758,
    lng: -121.5983,
    elev_m: 1341,
    reservable: 1,
    hazards: ['weather', 'wildfire', 'wildlife', 'water', 'lahar'],
    official_url: 'https://www.recreation.gov/camping/campgrounds/232475',
    blurb: 'Takhlakh Lake is the postcard: Mount Adams reflected in still water at dawn, with a paved loop road and no motors allowed on the lake.',
    neighbours: ['Adams Fork', 'Council Lake'],
    loops: ['LOOP A', 'LOOP B'],
    siteCount: 32,
  },
  {
    slug: 'ohanapecosh',
    name: 'Ohanapecosh',
    agency: 'nps',
    agency_full: 'National Park Service',
    unit: 'Mount Rainier NP',
    lat: 46.7333,
    lng: -121.5686,
    elev_m: 594,
    reservable: 1,
    hazards: ['weather', 'wildfire', 'wildlife', 'water', 'lahar'],
    official_url: 'https://www.recreation.gov/camping/campgrounds/232466',
    blurb: 'Ohanapecosh is the old-growth campground of Mount Rainier — 188 sites under a canopy so dense the loops stay dim at midday.',
    neighbours: ['Cougar Rock', 'Adams Fork'],
    loops: ['LOOP A', 'LOOP B', 'LOOP C'],
    siteCount: 48,
  },
  {
    slug: 'cougar-rock',
    name: 'Cougar Rock',
    agency: 'nps',
    agency_full: 'National Park Service',
    unit: 'Mount Rainier NP',
    lat: 46.7697,
    lng: -121.7906,
    elev_m: 979,
    reservable: 1,
    hazards: ['weather', 'wildfire', 'wildlife', 'water', 'lahar'],
    official_url: 'https://www.recreation.gov/camping/campgrounds/232465',
    blurb: 'Cougar Rock is the Nisqually-side base camp, close enough to Paradise that the shuttle traffic hums past the entrance all summer.',
    neighbours: ['Ohanapecosh'],
    loops: ['LOOP D', 'LOOP E'],
    siteCount: 40,
  },
  {
    slug: 'kalaloch',
    name: 'Kalaloch',
    agency: 'nps',
    agency_full: 'National Park Service',
    unit: 'Olympic NP',
    lat: 47.6086,
    lng: -124.3747,
    elev_m: 18,
    reservable: 1,
    hazards: ['weather', 'wildlife', 'water', 'tsunami'],
    official_url: 'https://www.recreation.gov/camping/campgrounds/232464',
    blurb: 'Kalaloch is a bluff-top campground on the outer coast, where the Pacific storms arrive without a landmass in the way for four thousand miles.',
    neighbours: ['Deception Pass'],
    loops: ['MAIN LOOP'],
    siteCount: 36,
  },
  {
    slug: 'steamboat-rock',
    name: 'Steamboat Rock',
    agency: 'wa-state-parks',
    agency_full: 'Washington State Parks',
    unit: 'Steamboat Rock State Park',
    lat: 47.8639,
    lng: -119.1272,
    elev_m: 476,
    reservable: 1,
    hazards: ['weather', 'wildfire', 'wildlife', 'water'],
    official_url: 'https://washington.goingtocamp.com/SteamboatRockPark',
    blurb: 'Steamboat Rock is the Banks Lake basalt butte, a desert park with irrigated lawns, hot nights, and the best swimming water east of the Cascades.',
    neighbours: ['Deception Pass'],
    loops: ['BAY LOOP', 'FOREBAY LOOP'],
    siteCount: 44,
  },
  {
    slug: 'fort-ebey',
    name: 'Fort Ebey',
    agency: 'wa-state-parks',
    agency_full: 'Washington State Parks',
    unit: 'Fort Ebey State Park',
    lat: 48.2214,
    lng: -122.7614,
    elev_m: 46,
    reservable: 1,
    hazards: ['weather', 'wildlife', 'water', 'tsunami'],
    official_url: 'https://washington.goingtocamp.com/FortEbeyPark',
    blurb: 'Fort Ebey is a WWII coastal battery turned campground, on the Whidbey bluff above the strait with the driest weather in western Washington.',
    neighbours: ['Deception Pass'],
    loops: ['UPPER LOOP'],
    siteCount: 28,
  },
  {
    slug: 'middle-fork',
    name: 'Middle Fork',
    agency: 'usfs',
    agency_full: 'US Forest Service',
    unit: 'Mt. Baker-Snoqualmie NF',
    lat: 47.5486,
    lng: -121.5497,
    elev_m: 335,
    reservable: 1,
    hazards: ['weather', 'wildfire', 'wildlife', 'water'],
    official_url: 'https://www.recreation.gov/camping/campgrounds/233864',
    blurb: 'Middle Fork is the closest Forest Service campground to Seattle that still feels like the mountains, on the river below the Garfield Ledges.',
    neighbours: ['Denny Creek'],
    loops: ['RIVERBEND'],
    siteCount: 30,
  },
  {
    slug: 'denny-creek',
    name: 'Denny Creek',
    agency: 'usfs',
    agency_full: 'US Forest Service',
    unit: 'Mt. Baker-Snoqualmie NF',
    lat: 47.4139,
    lng: -121.4433,
    elev_m: 692,
    reservable: 1,
    hazards: ['weather', 'wildfire', 'wildlife', 'water'],
    official_url: 'https://www.recreation.gov/camping/campgrounds/232287',
    blurb: 'Denny Creek sits in the I-90 corridor under Snoqualmie Pass, close enough to hear the freeway and close enough to the waterslide trail to forgive it.',
    neighbours: ['Middle Fork'],
    // A NULL loop — the exporter leaves it unset for some campgrounds.
    loops: [null],
    siteCount: 26,
  },
  {
    slug: 'salmon-la-sac',
    name: 'Salmon La Sac',
    agency: 'usfs',
    agency_full: 'US Forest Service',
    unit: 'Okanogan-Wenatchee NF',
    lat: 47.3986,
    lng: -121.0961,
    elev_m: 719,
    reservable: 1,
    hazards: ['weather', 'wildfire', 'wildlife', 'water'],
    official_url: 'https://www.recreation.gov/camping/campgrounds/232288',
    blurb: 'Salmon La Sac is the road-end campground on the Cle Elum River, the staging ground for the whole Alpine Lakes eastern approach.',
    neighbours: ['Denny Creek'],
    loops: ['CAYUSE', 'SALMON LA SAC'],
    siteCount: 34,
  },
  {
    // Zero sites — the codex only ever covered reservable rec.gov campgrounds,
    // so a map-only or first-come entry legitimately has an empty roster.
    slug: 'beacon-rock',
    name: 'Beacon Rock',
    agency: 'wa-state-parks',
    agency_full: 'Washington State Parks',
    unit: 'Beacon Rock State Park',
    lat: 45.6289,
    lng: -122.0219,
    elev_m: 43,
    reservable: 0,
    hazards: ['weather', 'wildfire', 'wildlife', 'water'],
    official_url: 'https://washington.goingtocamp.com/BeaconRockPark',
    blurb: 'Beacon Rock is the Columbia Gorge monolith and the first-come campground beneath it — no reservations, no per-site pages in this codex.',
    neighbours: ['Steamboat Rock'],
    loops: [],
    siteCount: 0,
  },
];

const TYPES = [
  ['STANDARD NONELECTRIC', 'Overnight'],
  ['STANDARD ELECTRIC', 'Overnight'],
  ['TENT ONLY NONELECTRIC', 'Overnight'],
  ['RV NONELECTRIC', 'Overnight'],
  ['WALK TO', 'Overnight'],
];

/** The site-note body — verbatim in shape to the real export. */
function siteBody({ cgName, label, loop, type, use, providerId }) {
  return `# ${cgName} — ${label}

- **Campground:** [[${cgName}]]
- **Loop:** ${loop || '—'}
- **Type:** ${type} · ${use}
- **Reserve:** [recreation.gov](https://www.recreation.gov/camping/campsites/${providerId})

> Site ${label} in ${loop || 'this campground'} at [[${cgName}]]. Canonical data from recreation.gov via the Robot Geographical Society collector.
`;
}

/** Expand the seed into `codex_campground` / `codex_site` rows. */
export function fixtureRows(updated = '2026-07-24T09:12:00Z') {
  const campgrounds = [];
  const sites = [];
  let siteId = 1;
  let providerId = 82900;

  for (const cg of CAMPGROUNDS) {
    const body = cg.body || genericBody({
      name: cg.name,
      unit: cg.unit,
      agencyFull: cg.agency_full,
      elevFt: Math.round((cg.elev_m || 0) * 3.28084),
      blurb: cg.blurb,
      neighbours: cg.neighbours || [],
    });

    campgrounds.push({
      slug: cg.slug,
      name: cg.name,
      guid: null, // NULL in the real artifact too — joined from the inventory.
      agency: cg.agency,
      agency_full: cg.agency_full,
      unit: cg.unit,
      lat: cg.lat,
      lng: cg.lng,
      elev_m: cg.elev_m,
      reservable: cg.reservable,
      hazards: JSON.stringify(cg.hazards),
      official_url: cg.official_url,
      body,
      site_count: cg.siteCount,
      updated,
    });

    const loops = cg.loops.length ? cg.loops : [];
    for (let n = 0; n < cg.siteCount; n += 1) {
      // `collide` reuses the same label in every loop, which the real export
      // does whenever a park numbers its loops independently.
      const loop = loops.length ? loops[cg.collide ? n % loops.length : Math.floor(n / Math.ceil(cg.siteCount / loops.length))] : null;
      const label = String((cg.collide ? Math.floor(n / loops.length) : n) + 1).padStart(3, '0');
      const [type, use] = TYPES[n % TYPES.length];
      sites.push({
        id: siteId,
        campground_slug: cg.slug,
        site: label,
        loop,
        type: cg.agency === 'wa-state-parks' ? null : type, // WA leaves type null
        use: cg.agency === 'wa-state-parks' ? null : use,
        reservable: 1,
        provider_site_id: String(providerId),
        official_url: `https://www.recreation.gov/camping/campsites/${providerId}`,
        body: siteBody({ cgName: cg.name, label, loop, type, use, providerId }),
        updated,
      });
      siteId += 1;
      providerId += 1;
    }
  }

  return { campgrounds, sites };
}
