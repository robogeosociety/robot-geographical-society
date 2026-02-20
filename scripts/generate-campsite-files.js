#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BASE_DIR = '/Users/tommydoerr/dev/robot-geographical-society/data';

const MONTH_NAMES = [
  null, 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatOpenDate(yearRound, openMonth) {
  if (yearRound || openMonth == null) return 'null';
  return `"${MONTH_NAMES[openMonth]} 1"`;
}

function formatTypes(types) {
  return types.join(',');
}

function buildFrontmatter(fields) {
  const openDate = formatOpenDate(fields.year_round, fields.open_month);
  return `---
name: ${fields.name}
agency: ${fields.agency}
agency_short: ${fields.agency_short}
state: WA
lat: ${fields.lat}
lng: ${fields.lng}
sites: ${fields.sites}
types: [${formatTypes(fields.types)}]
reservable: ${fields.reservable}
year_round: ${fields.year_round}
open_date: ${openDate}
first_reservation_date: null
reservation_url: ${fields.reservation_url}
official_url: ${fields.reservation_url}
---

${fields.notes}
`;
}

function sanitizeDir(name) {
  // Keep the name as-is for directory (parentheses, spaces, etc.)
  return name;
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

let count = 0;

// ─── BLM ────────────────────────────────────────────────────────────────────
const blm = [
  { name: 'Liberty Recreation Site',   lat: 47.2638, lng: -120.9518, sites: 18, types: ['tent','rv'], reservable: false, year_round: true,  open_month: null, url: 'https://www.blm.gov/', notes: 'Near the historic gold mining town of Liberty; dispersed camping area' },
  { name: 'Fishtrap Recreation Area',  lat: 47.4438, lng: -117.6929, sites: 20, types: ['tent','rv'], reservable: false, year_round: true,  open_month: null, url: 'https://www.blm.gov/', notes: 'On Fishtrap Lake near Sprague; wildlife-rich shrub-steppe environment' },
  { name: 'Taunton Dispersed Area',    lat: 47.1704, lng: -119.2238, sites: 15, types: ['tent','rv'], reservable: false, year_round: true,  open_month: null, url: 'https://www.blm.gov/', notes: 'Dispersed camping in Columbia Plateau; excellent stargazing' },
  { name: 'Juniper Dunes Wilderness',  lat: 46.5471, lng: -118.9054, sites: 10, types: ['tent'],      reservable: false, year_round: true,  open_month: null, url: 'https://www.blm.gov/', notes: 'Primitive camping near the largest natural juniper forest in WA; no facilities' },
  { name: 'Yakima River Canyon',       lat: 46.8268, lng: -120.4927, sites: 25, types: ['tent','rv'], reservable: false, year_round: true,  open_month: null, url: 'https://www.blm.gov/', notes: 'Along the Yakima River between Ellensburg and Yakima; popular for fly fishing' },
];

for (const c of blm) {
  const filePath = path.join(BASE_DIR, 'blm', 'WA', sanitizeDir(c.name), 'index.md');
  const content = buildFrontmatter({
    name: c.name,
    agency: 'Bureau of Land Management',
    agency_short: 'blm',
    lat: c.lat,
    lng: c.lng,
    sites: c.sites,
    types: c.types,
    reservable: c.reservable,
    year_round: c.year_round,
    open_month: c.open_month,
    reservation_url: c.url,
    notes: c.notes,
  });
  writeFile(filePath, content);
  console.log(`  created: ${filePath}`);
  count++;
}

// ─── NPS ────────────────────────────────────────────────────────────────────
const nps = [
  // Olympic NP
  { park: 'Olympic NP', name: 'Deer Park',          lat: 47.9511, lng: -123.2583, sites: 14,  types: ['tent'],             reservable: false, year_round: false, open_month: 7,    url: 'https://www.recreation.gov/', notes: 'High alpine meadow campground; no RVs; stunning views of the Strait of Juan de Fuca' },
  { park: 'Olympic NP', name: 'Fairholme',           lat: 48.0590, lng: -123.9021, sites: 88,  types: ['tent','rv'],        reservable: true,  year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'On the west end of Lake Crescent; boat launch access' },
  { park: 'Olympic NP', name: 'Graves Creek',        lat: 47.5682, lng: -123.7058, sites: 30,  types: ['tent','rv'],        reservable: false, year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'In the Quinault Rain Forest; trailhead for Enchanted Valley hike' },
  { park: 'Olympic NP', name: "Heart O' the Hills",  lat: 47.9813, lng: -123.4318, sites: 105, types: ['tent','rv'],        reservable: true,  year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Main campground for Hurricane Ridge area access' },
  { park: 'Olympic NP', name: 'Hoh Rain Forest',     lat: 47.8601, lng: -123.9348, sites: 88,  types: ['tent','rv'],        reservable: true,  year_round: true,  open_month: null, url: 'https://www.recreation.gov/', notes: 'In the heart of the temperate rain forest; Hall of Mosses trailhead' },
  { park: 'Olympic NP', name: 'Kalaloch',             lat: 47.6107, lng: -124.3757, sites: 170, types: ['tent','rv','cabin'], reservable: true,  year_round: true,  open_month: null, url: 'https://www.recreation.gov/', notes: 'On coastal bluffs above the Pacific; beach access and tide pools' },
  { park: 'Olympic NP', name: 'Mora',                 lat: 47.9218, lng: -124.5972, sites: 94,  types: ['tent','rv'],        reservable: true,  year_round: true,  open_month: null, url: 'https://www.recreation.gov/', notes: 'Near Rialto Beach; old-growth forest along Quillayute River' },
  { park: 'Olympic NP', name: 'North Fork',           lat: 47.5271, lng: -123.5913, sites: 9,   types: ['tent'],             reservable: false, year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Small primitive campground in Quinault Valley' },
  { park: 'Olympic NP', name: 'Queets',               lat: 47.5228, lng: -124.0992, sites: 20,  types: ['tent'],             reservable: false, year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Remote campground in the Queets River valley; old-growth rainforest' },
  { park: 'Olympic NP', name: 'Sol Duc',              lat: 47.9704, lng: -124.1565, sites: 82,  types: ['tent','rv'],        reservable: true,  year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Along the Sol Duc River; hot springs resort nearby' },
  { park: 'Olympic NP', name: 'South Beach',          lat: 47.5715, lng: -124.3656, sites: 55,  types: ['tent','rv'],        reservable: false, year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Primitive coastal campground just south of Kalaloch' },
  { park: 'Olympic NP', name: 'Staircase',            lat: 47.5163, lng: -123.3283, sites: 47,  types: ['tent','rv'],        reservable: true,  year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'At the foot of the North Fork Skokomish River; gateway to the Olympics' },
  // Mt. Rainier NP
  { park: 'Mt. Rainier NP', name: 'Cougar Rock',     lat: 46.7613, lng: -121.8059, sites: 173, types: ['tent','rv'],        reservable: true,  year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Near the Paradise area; excellent views of the Tatoosh Range' },
  { park: 'Mt. Rainier NP', name: 'White River',     lat: 46.9010, lng: -121.6403, sites: 112, types: ['tent','rv'],        reservable: true,  year_round: false, open_month: 7,    url: 'https://www.recreation.gov/', notes: 'Trailhead for Sunrise area and Emmons Glacier route' },
  { park: 'Mt. Rainier NP', name: 'Ohanapecosh',     lat: 46.7296, lng: -121.5682, sites: 188, types: ['tent','rv'],        reservable: true,  year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'In old-growth forest on the SE side of Rainier; Grove of the Patriarchs nearby' },
  { park: 'Mt. Rainier NP', name: 'Mowich Lake',     lat: 46.9329, lng: -121.8636, sites: 30,  types: ['tent'],             reservable: false, year_round: false, open_month: 7,    url: 'https://www.recreation.gov/', notes: 'Walk-in only; on the remote NW side of Rainier; no RVs or trailers' },
  // North Cascades NP
  { park: 'North Cascades NP', name: 'Newhalem Creek',       lat: 48.6718, lng: -121.2441, sites: 111, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Main campground at the Ross Lake NRA gateway town of Newhalem' },
  { park: 'North Cascades NP', name: 'Gorge Lake',           lat: 48.6780, lng: -121.1948, sites: 6,   types: ['tent'],      reservable: false, year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Small primitive campground on Gorge Lake; walk-in sites' },
  { park: 'North Cascades NP', name: 'Goodell Creek',        lat: 48.6793, lng: -121.2563, sites: 21,  types: ['tent','rv'], reservable: false, year_round: true,  open_month: null, url: 'https://www.recreation.gov/', notes: 'Year-round campground; popular for whitewater kayaking put-in' },
  { park: 'North Cascades NP', name: 'Colonial Creek North', lat: 48.6996, lng: -121.0718, sites: 60,  types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'On the north shore of Diablo Lake; stunning turquoise waters' },
  { park: 'North Cascades NP', name: 'Colonial Creek South', lat: 48.6957, lng: -121.0760, sites: 32,  types: ['tent','rv'], reservable: false, year_round: false, open_month: 5,    url: 'https://www.recreation.gov/', notes: 'Walk-in sites on south shore of Diablo Lake' },
  // Lake Roosevelt NRA
  { park: 'Lake Roosevelt NRA', name: 'Kettle Falls',  lat: 48.6099, lng: -118.0634, sites: 76, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'On the upper Columbia/Lake Roosevelt; near historic Kettle Falls' },
  { park: 'Lake Roosevelt NRA', name: 'Spring Canyon', lat: 47.9318, lng: -118.9808, sites: 87, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Near the town of Grand Coulee; swimming beach on Lake Roosevelt' },
  { park: 'Lake Roosevelt NRA', name: 'Snag Cove',     lat: 48.5174, lng: -118.3119, sites: 9,  types: ['tent'],      reservable: false, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Small boat-in or hike-in campground on Lake Roosevelt' },
];

for (const c of nps) {
  const filePath = path.join(BASE_DIR, 'nps', 'WA', sanitizeDir(c.park), sanitizeDir(c.name), 'index.md');
  const content = buildFrontmatter({
    name: c.name,
    agency: 'National Park Service',
    agency_short: 'nps',
    lat: c.lat,
    lng: c.lng,
    sites: c.sites,
    types: c.types,
    reservable: c.reservable,
    year_round: c.year_round,
    open_month: c.open_month,
    reservation_url: c.url,
    notes: c.notes,
  });
  writeFile(filePath, content);
  console.log(`  created: ${filePath}`);
  count++;
}

// ─── USFS ───────────────────────────────────────────────────────────────────
const usfs = [
  // Gifford Pinchot NF
  { forest: 'Gifford Pinchot NF', name: 'Takhlakh Lake',              lat: 46.2668, lng: -121.6018, sites: 54, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 7, url: 'https://www.recreation.gov/', notes: 'Stunning views of Mt. Adams from the lake; high-elevation campground' },
  { forest: 'Gifford Pinchot NF', name: 'Walupt Lake',                lat: 46.4154, lng: -121.4729, sites: 44, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 7, url: 'https://www.recreation.gov/', notes: 'Remote lake near the Goat Rocks Wilderness; excellent fishing' },
  { forest: 'Gifford Pinchot NF', name: 'Steamboat Creek (Iron Creek)',lat: 46.5296, lng: -121.9866, sites: 98, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Near Mt. St. Helens; along Cispus River corridor' },
  { forest: 'Gifford Pinchot NF', name: 'Trout Lake Creek',           lat: 45.9954, lng: -121.5436, sites: 21, types: ['tent','rv'], reservable: false, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Near Trout Lake; gateway to Mt. Adams Wilderness trails' },
  { forest: 'Gifford Pinchot NF', name: 'Blue Lake Creek',            lat: 45.9882, lng: -121.6557, sites: 11, types: ['tent'],      reservable: false, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Small creek-side campground near Trout Lake' },
  // Okanogan-Wenatchee NF
  { forest: 'Okanogan-Wenatchee NF', name: 'Bumping Lake',            lat: 46.9213, lng: -121.2990, sites: 45, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 6, url: 'https://www.recreation.gov/', notes: 'On Bumping Lake reservoir; excellent hiking into the Norse Peak Wilderness' },
  { forest: 'Okanogan-Wenatchee NF', name: 'Soda Springs',            lat: 46.9441, lng: -121.3574, sites: 26, types: ['tent','rv'], reservable: false, year_round: false, open_month: 6, url: 'https://www.recreation.gov/', notes: 'Along Bumping River; natural carbonated spring nearby' },
  { forest: 'Okanogan-Wenatchee NF', name: 'Cottonwood',              lat: 47.8543, lng: -120.5218, sites: 25, types: ['tent','rv'], reservable: false, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'On the Entiat River near Lake Chelan NRA; remote and uncrowded' },
  { forest: 'Okanogan-Wenatchee NF', name: 'Chiwawa Horse Camp',      lat: 47.9696, lng: -120.6629, sites: 21, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 6, url: 'https://www.recreation.gov/', notes: 'Horse camp in the Chiwawa River corridor; Glacier Peak Wilderness access' },
  { forest: 'Okanogan-Wenatchee NF', name: 'Rimrock Lake (Indian Creek)', lat: 46.6571, lng: -121.2246, sites: 39, types: ['tent','rv'], reservable: true, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'On Rimrock Lake reservoir; fishing and swimming' },
  // Mt. Baker-Snoqualmie NF
  { forest: 'Mt. Baker-Snoqualmie NF', name: 'Denny Creek',           lat: 47.4221, lng: -121.4338, sites: 33, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Near Snoqualmie Pass; access to Franklin Falls and Alpine Lakes Wilderness' },
  { forest: 'Mt. Baker-Snoqualmie NF', name: 'Beckler River',         lat: 47.7671, lng: -121.3944, sites: 27, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Along the Beckler River near Skykomish; popular for families' },
  { forest: 'Mt. Baker-Snoqualmie NF', name: 'Douglas Fir',           lat: 48.5518, lng: -121.7654, sites: 30, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'On the North Fork Nooksack River; gateway to Mt. Baker' },
  { forest: 'Mt. Baker-Snoqualmie NF', name: 'Buck Creek',            lat: 48.1629, lng: -121.3118, sites: 29, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 6, url: 'https://www.recreation.gov/', notes: 'On the Suiattle River; access to Glacier Peak Wilderness' },
  { forest: 'Mt. Baker-Snoqualmie NF', name: 'Clear Creek',           lat: 48.2354, lng: -121.8154, sites: 12, types: ['tent','rv'], reservable: false, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Small campground on the Sauk River near Darrington' },
  // Olympic NF
  { forest: 'Olympic NF', name: 'Falls Creek',                        lat: 47.5482, lng: -124.0718, sites: 31, types: ['tent','rv'], reservable: false, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'In the Quinault Valley; access to Lake Quinault and rainforest trails' },
  { forest: 'Olympic NF', name: 'Coho',                               lat: 47.4579, lng: -123.6254, sites: 56, types: ['tent','rv'], reservable: false, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'On Lake Cushman in Hood Canal area' },
  { forest: 'Olympic NF', name: 'Wynoochee Lake',                     lat: 47.3871, lng: -123.5846, sites: 40, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'On Wynoochee Lake reservoir; swimming, fishing, and boating' },
  // Colville NF
  { forest: 'Colville NF', name: 'Bonaparte Lake',                    lat: 48.7982, lng: -119.0615, sites: 28, types: ['tent','rv'], reservable: true,  year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Scenic lake in northeast WA near Tonasket; good fishing' },
  { forest: 'Colville NF', name: 'Beaver Lake',                       lat: 48.5146, lng: -118.8527, sites: 24, types: ['tent','rv'], reservable: false, year_round: false, open_month: 5, url: 'https://www.recreation.gov/', notes: 'Remote lake in the Colville NF; wildlife viewing and fishing' },
  { forest: 'Colville NF', name: 'Lake Leo',                          lat: 48.6418, lng: -118.6907, sites: 8,  types: ['tent'],      reservable: false, year_round: false, open_month: 6, url: 'https://www.recreation.gov/', notes: 'Small alpine lake campground; hike-in only' },
];

for (const c of usfs) {
  const filePath = path.join(BASE_DIR, 'usfs', 'WA', sanitizeDir(c.forest), sanitizeDir(c.name), 'index.md');
  const content = buildFrontmatter({
    name: c.name,
    agency: 'US Forest Service',
    agency_short: 'usfs',
    lat: c.lat,
    lng: c.lng,
    sites: c.sites,
    types: c.types,
    reservable: c.reservable,
    year_round: c.year_round,
    open_month: c.open_month,
    reservation_url: c.url,
    notes: c.notes,
  });
  writeFile(filePath, content);
  console.log(`  created: ${filePath}`);
  count++;
}

// ─── WA State Parks ──────────────────────────────────────────────────────────
const waParks = [
  { name: 'Deception Pass State Park',        lat: 48.4073, lng: -122.6430, sites: 310, types: ['tent','rv','walk-in'], reservable: true,  year_round: false, open_month: 3,    url: 'https://washington.goingtocamp.com/', notes: 'Largest state park campground; Cranberry Lake and North Beach loops' },
  { name: 'Larrabee State Park',              lat: 48.6618, lng: -122.4875, sites: 87,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'First state park in WA; saltwater access on Samish Bay' },
  { name: 'Moran State Park (Orcas Island)',  lat: 48.6571, lng: -122.8327, sites: 151, types: ['tent','rv','walk-in'], reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Four campgrounds near Summit Lake and Cascade Lake on Orcas Island' },
  { name: 'Fort Worden State Park',           lat: 48.1329, lng: -122.7602, sites: 80,  types: ['tent','rv'],           reservable: true,  year_round: true,  open_month: null, url: 'https://washington.goingtocamp.com/', notes: 'Historic fort on Port Townsend Bay; year-round camping available' },
  { name: 'Fort Flagler State Park',          lat: 48.0929, lng: -122.7005, sites: 116, types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Former military fort on Marrowstone Island; panoramic views of Puget Sound' },
  { name: 'Dosewallips State Park',           lat: 47.6868, lng: -122.9017, sites: 140, types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'At the confluence of the Dosewallips River and Hood Canal' },
  { name: 'Potlatch State Park',              lat: 47.5571, lng: -123.1581, sites: 35,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'On Hood Canal; excellent oyster and shellfish harvesting' },
  { name: 'Kitsap Memorial State Park',       lat: 47.8374, lng: -122.6391, sites: 43,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Wooded park on Hood Canal near Poulsbo' },
  { name: 'Sequim Bay State Park',            lat: 48.0457, lng: -123.0419, sites: 86,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Protected bay in the Olympic rain shadow; calm waters for boating' },
  { name: 'Bogachiel State Park',             lat: 47.8982, lng: -124.2786, sites: 42,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Along the Bogachiel River near Forks; gateway to Olympic backcountry' },
  { name: 'Cape Disappointment State Park',   lat: 46.2874, lng: -124.0557, sites: 250, types: ['tent','rv','cabin'],   reservable: true,  year_round: true,  open_month: null, url: 'https://washington.goingtocamp.com/', notes: 'Where the Columbia River meets the Pacific; two historic lighthouses' },
  { name: 'Bruceport County Park',            lat: 46.6157, lng: -123.8234, sites: 30,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 5,    url: 'https://washington.goingtocamp.com/', notes: 'On Willapa Bay near South Bend' },
  { name: 'Grayland Beach State Park',        lat: 46.7716, lng: -124.0871, sites: 100, types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Ocean beach camping near cranberry bogs' },
  { name: 'Pacific Beach State Park',         lat: 47.2107, lng: -124.2001, sites: 138, types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Right on the Pacific Ocean; popular for razor clam season' },
  { name: 'Ocean City State Park',            lat: 47.0388, lng: -124.1655, sites: 178, types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'On the Long Beach Peninsula; vast sandy beach access' },
  { name: 'Beacon Rock State Park',           lat: 45.6254, lng: -121.9997, sites: 35,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Below the famous basalt monolith in the Columbia River Gorge' },
  { name: 'Seaquest State Park',              lat: 46.2916, lng: -122.8268, sites: 92,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Adjacent to Mount St. Helens National Volcanic Monument; views of the volcano' },
  { name: 'Paradise Point State Park',        lat: 45.8613, lng: -122.7108, sites: 70,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Along the East Fork Lewis River near Ridgefield' },
  { name: 'Battle Ground Lake State Park',    lat: 45.7957, lng: -122.4875, sites: 50,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Volcanic lake in Clark County; swimming and fishing' },
  { name: 'Sun Lakes-Dry Falls State Park',   lat: 47.5968, lng: -119.4644, sites: 193, types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Near the world\'s largest prehistoric waterfall; coulees and lakes' },
  { name: 'Steamboat Rock State Park',        lat: 47.8596, lng: -119.0871, sites: 213, types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'On Banks Lake in the Grand Coulee area; massive basalt butte' },
  { name: 'Riverside State Park',             lat: 47.7046, lng: -117.4793, sites: 16,  types: ['tent','rv'],           reservable: true,  year_round: true,  open_month: null, url: 'https://washington.goingtocamp.com/', notes: 'Along the Spokane River near Spokane; Bowl and Pitcher area' },
  { name: 'Osoyoos Lake State Park',          lat: 48.9493, lng: -119.4436, sites: 86,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Warmest lake in WA on the Canadian border; excellent swimming' },
  { name: 'Curlew Lake State Park',           lat: 48.7096, lng: -118.6668, sites: 82,  types: ['tent','rv'],           reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Scenic lake in Ferry County near Republic' },
  { name: 'Palouse Falls State Park',         lat: 46.6638, lng: -118.2274, sites: 10,  types: ['tent'],                reservable: true,  year_round: false, open_month: 4,    url: 'https://washington.goingtocamp.com/', notes: 'Washington State waterfall; 198-ft drop into the Palouse River canyon' },
];

for (const c of waParks) {
  const filePath = path.join(BASE_DIR, 'wa-state-parks', 'WA', sanitizeDir(c.name), 'index.md');
  const content = buildFrontmatter({
    name: c.name,
    agency: 'Washington State Parks',
    agency_short: 'wa-state-parks',
    lat: c.lat,
    lng: c.lng,
    sites: c.sites,
    types: c.types,
    reservable: c.reservable,
    year_round: c.year_round,
    open_month: c.open_month,
    reservation_url: c.url,
    notes: c.notes,
  });
  writeFile(filePath, content);
  console.log(`  created: ${filePath}`);
  count++;
}

console.log(`\nDone. ${count} files created.`);
