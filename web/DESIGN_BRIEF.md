# Design brief — "A peek into a secret mountain valley"

Paste this into the **claude.ai/design** agent to prototype the redesign. It describes the
real product (Robot Geographical Society — a Washington campsite reservation map) so the
mockups use real screens and real data, then re-skins it in the target aesthetic. Iterate
on the look there; once a direction is approved, it gets implemented in `web/` (React +
Vite + Mapbox GL JS).

---

## The concept

Robot Geographical Society helps people find and reserve campsites across Washington —
State Parks, National Park Service, US Forest Service, BLM. Today it's a flat dark
dashboard with a map behind floating pills. Reimagine the whole UI as **a peek into a
secret mountain valley**: the screen is a window you lean through to glimpse a hidden
alpine basin, and the data lives on **frosted-glass panels floating in the foreground**,
like a HUD seen through a misted pane. The map is never flat or top-down — it's a
**pitched, oblique, almost-3D** view of real terrain, lit at golden/blue hour. Moving
between places is a **cinematic fly-to**: the camera banks and descends through a notch
to *reveal* the valley.

Three pillars (non-negotiable):
1. **Fly-to reveals** — cinematic, eased camera moves with pitch + bearing. App entry
   flies from a high orbit down into the valley. Selecting a campground banks and zooms in.
2. **Oblique imagery** — pitched satellite/terrain (60–70° pitch), 3D terrain exaggeration,
   low sun angle, atmospheric haze. Static oblique renders as hero/loading backdrops.
3. **Apple-style glass overlays** — visionOS / iOS Control Center vibrancy: `backdrop-filter`
   blur + saturation, hairline 1px borders, soft inner highlight, gentle drop shadow,
   large corner radii, translucent depth. Data floats *in front of* the valley.

## Look & feel

- **Mood:** alpine dusk / golden hour. Deep twilight teal-blues, glacier white, mist. A
  soft dark **vignette at the edges** sells the "peeking through an opening" framing.
- **Glass:** near-white frost over the dark terrain, ~12–24px blur, ~140–180% saturation,
  `border: 1px solid rgba(255,255,255,.18)`, faint top inner-glow, soft shadow. Rounded
  ~16–22px. Panels should feel like they have real depth and parallax slightly over the map.
- **Typography:** clean humanist sans (SF Pro / Inter). A tabular **mono only for numerics**
  (counts, percentages, dates). Drop the all-monospace dashboard feel.
- **Keep these data colors** — they encode meaning, just make them *glow* against terrain:
  - Agencies: WA State Parks `#A6E22E` (green), National Park Service `#FD971F` (orange),
    US Forest Service `#66D9EF` (cyan), BLM `#E6DB74` (yellow).
  - Availability ramp (lots → none remaining): green `#3FB950` → amber `#D29922` →
    orange `#E0843B` → red `#F85149`.
  - Collector health: healthy `#3FB950`, overdue `#D29922`, quarantined `#F85149`,
    disabled `#6E7681`.
- Campgrounds on the map read as **glowing beacons / luminous discs** seated in the terrain
  (replacing today's flat agency-colored "pac-man" discs whose fill = remaining availability).

## The product — five views (mock all five)

A persistent oblique valley map fills the screen behind everything. A slim **glass top bar**
holds the wordmark "Robot Geographical Society" and glass nav tabs. Each view drops its own
glass overlays on the map.

1. **Availability** (the hero). The valley overview. Every campground is a luminous,
   agency-tinted beacon whose fill = remaining availability for the rest of the year.
   Top-left: a glass status chip ("142 campgrounds · fill = remaining availability") + a
   freshness banner. Bottom: a glass **agency legend**. Selecting a beacon flies the camera
   in and slides up a **glass detail panel**: campground name, agency tag, an "open / reserved
   / total campsites" summary pill, a night picker, and a drill-down to an individual
   **campsite** (e.g. "#24", with its loop) showing a per-night red/green availability calendar.
2. **Demand.** Same valley; beacons colored **cold → hot** (green→amber→red) by how booked
   each campground is. A glass ranking panel: "Hottest upcoming nights" and "Most in-demand
   campgrounds."
3. **Calendar.** A glass calendar panel answering "how does the season fill up, day by day?"
   Each day is a frosted cell **filled top→bottom** by the share of sites still open that
   night. Scopes: all campgrounds → one campground → one campsite (red/green per night).
4. **Watch.** "Watch this date fill up." Beacons colored by how full a watched night is now;
   a glass panel ranks the hottest watches and draws each one's **% booked over time fill-curve**
   as a glowing line chart on glass.
5. **Collectors** (ops view). Beacons colored by fleet state (healthy / overdue / quarantined
   / disabled); a glass panel lists collectors and a quarantine list with a reactivate action.

## Real vocabulary (use it in the mockups so they feel real)

- Hierarchy: **campground** (e.g. *Middle Fork*) → **loop** (*Riverbend*) → **campsite**
  (the bookable unit, labeled like *#24*). Never call a campground a "site."
- Per-night campsite status: **available / reserved / other**.
- Plausible Washington names to populate beacons & panels: Middle Fork, Mowich Lake,
  Colonial Creek, Newhalem Creek, Kalaloch, Deception Pass, Salmon la Sac, Denny Creek,
  Beckler River, Money Creek; agencies as above.

## Motion to demonstrate

- **Entry reveal:** high orbit → descend through a notch into the valley, pitch settling ~65°.
- **Tab switch:** lateral glide between views, glass panels cross-fading, not hard cuts.
- **Select campground:** eased `flyTo` (bank + zoom), then the detail panel materializes with
  a glass blur-in.
- Subtle living atmosphere: drifting haze, a slow parallax of glass over the moving map.

## Deliver

Mock the **five views** as glass-over-valley screens (Availability in most depth, including
the campground → campsite drill-down and calendar), plus the **entry fly-to reveal** and one
**selection fly-to** as motion studies. Show light & dark valley times of day if useful. Keep
the agency/availability/health color semantics intact throughout.
