/**
 * VaultMarkdownLoop — a separate collector loop that renders the per-campsite Obsidian
 * markdown (one note per individual campsite) + a per-campground loop canvas, and banks
 * them to the `campsite-vault` R2 bucket. It does NOT touch recreation.gov: it reads the
 * per-site structure the availability CollectorLoop already wrote to RAW R2
 * (`sites/<date>/<id>.json`) and transforms it into vault files.
 *
 * Layout in the VAULT bucket (mirrors the Obsidian camping vault tree):
 *   Campsites/<Campground>/Sites/<label>.md          tag: campsite-site
 *   Campsites/<Campground>/<Campground> loops.canvas
 *   manifest.json   — [{name, agency, lat, lng, sites, files[]}] for geo-filtered sync
 *
 * Loop geometry is synthesized (rec.gov has no per-site coordinates): a tidy grid per loop.
 * The local Obsidian vault mirrors only an *area of interest* from this bucket (the
 * obsidian-automations `vault_sync` job filters by distance), so all campgrounds live here
 * while only nearby ones sync down. Self-perpetuates daily via continue-as-new.
 *
 * Start once: POST /vault/start.
 */
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import { loadInventory } from "./inventory";
import type { WfEnv } from "./workflows";

type Site = {
  id: string;
  kind: "rec" | "wa";
  ref: string | number;
  name: string;
  agency: string;
  collect?: boolean;
  lat?: number | null;
  lng?: number | null;
};

type PerSite = { label: string | null; loop: string | null; type: string | null; use: string | null };
type SitesSnap = { collected_date?: string; sites?: Record<string, PerSite> };

const OBS_COLORS = ["1", "2", "3", "4", "5", "6"];
const LOOKBACK_DAYS = 35;

const safe = (label: string) => (String(label).replace(/[^A-Za-z0-9._-]/g, "_").replace(/^_+|_+$/g, "") || "site");

/** Read the most recent per-site snapshot for a campground from RAW (newest→oldest). */
async function latestSites(env: WfEnv, id: string): Promise<SitesSnap | null> {
  const now = Date.now();
  for (let d = 0; d < LOOKBACK_DAYS; d++) {
    const date = new Date(now - d * 86_400_000).toISOString().slice(0, 10);
    const o = await env.RAW.get(`sites/${date}/${id}.json`);
    if (o) return (await o.json()) as SitesSnap;
  }
  return null;
}

function siteNote(cg: string, siteId: string, ps: PerSite): string {
  const label = ps.label || siteId;
  const loop = ps.loop || "—";
  const typ = ps.type || "";
  const use = ps.use || "";
  const url = siteId ? `https://www.recreation.gov/camping/campsites/${siteId}` : "";
  const fm = [
    "---", "tags:", "  - campsite-site",
    `site: "${label}"`, `campground: "[[${cg}]]"`, `loop: "${loop}"`,
    `type: "${typ}"`, `use: "${use}"`, "reservable: true",
    `provider_site_id: "${siteId}"`, "source: robot-geographical-society",
  ];
  if (url) fm.push(`official_url: "${url}"`);
  fm.push("---");
  const body = [
    "", `# ${cg} — ${label}`, "",
    `- **Campground:** [[${cg}]]`, `- **Loop:** ${loop}`,
    `- **Type:** ${typ}${use ? " · " + use : ""}`,
  ];
  if (url) body.push(`- **Reserve:** [recreation.gov](${url})`);
  body.push("", `> Site ${label} in ${loop} at [[${cg}]]. Canonical data from recreation.gov via the Robot Geographical Society collector.`, "");
  return [...fm, ...body].join("\n");
}

type Entry = { siteId: string; ps: PerSite; fname: string };

function assignFnames(entries: Entry[]): void {
  const seen = new Set<string>();
  for (const e of entries) {
    let stem = safe(e.ps.label || e.siteId || "site");
    if (seen.has(stem)) stem = `${stem}_${safe(e.siteId)}`;
    seen.add(stem);
    e.fname = stem;
  }
}

function buildCanvas(cg: string, entries: Entry[]): unknown {
  const byLoop = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = e.ps.loop || "—";
    (byLoop.get(k) ?? byLoop.set(k, []).get(k)!).push(e);
  }
  const nodes: unknown[] = [{ id: "cg", type: "file", file: `Campsites/${cg}.md`, x: 0, y: -300, width: 360, height: 120 }];
  const edges: unknown[] = [];
  const COLW = 200, ROWH = 110, PERROW = 5;
  const loopGap = COLW * PERROW + 160;
  const loops = [...byLoop.keys()].sort();
  loops.forEach((loop, li) => {
    const color = OBS_COLORS[li % OBS_COLORS.length];
    const lx = li * loopGap;
    const hub = `loop${li}`;
    const group = byLoop.get(loop)!.slice().sort((a, b) => (a.ps.label || "").localeCompare(b.ps.label || ""));
    nodes.push({ id: hub, type: "text", text: `### ${loop}\n${group.length} sites`, x: lx, y: 0, width: 280, height: 90, color });
    edges.push({ id: `e_cg_${hub}`, fromNode: "cg", toNode: hub });
    group.forEach((e, si) => {
      const row = Math.floor(si / PERROW), col = si % PERROW;
      const nid = `s_${li}_${si}`;
      nodes.push({ id: nid, type: "file", file: `Campsites/${cg}/Sites/${e.fname}.md`, x: lx + col * COLW, y: 150 + row * ROWH, width: COLW - 20, height: ROWH - 20, color });
      edges.push({ id: `e_${hub}_${nid}`, fromNode: hub, toNode: nid });
    });
  });
  return { nodes, edges };
}

type ManifestEntry = { name: string; agency: string; lat: number | null; lng: number | null; sites: number; files: string[] };

/** Render one campground's vault files into the VAULT bucket; return its manifest entry. */
async function genCampground(env: WfEnv, s: Site): Promise<ManifestEntry | null> {
  const snap = await latestSites(env, s.id);
  const sites = snap?.sites ?? {};
  const entries: Entry[] = Object.entries(sites).map(([siteId, ps]) => ({ siteId, ps, fname: "" }));
  if (entries.length === 0) return null;
  assignFnames(entries);
  const files: string[] = [];
  for (const e of entries) {
    const key = `Campsites/${s.name}/Sites/${e.fname}.md`;
    await env.VAULT.put(key, siteNote(s.name, e.siteId, e.ps));
    files.push(key);
  }
  const canvasKey = `Campsites/${s.name}/${s.name} loops.canvas`;
  await env.VAULT.put(canvasKey, JSON.stringify(buildCanvas(s.name, entries), null, 1));
  files.push(canvasKey);
  return { name: s.name, agency: s.agency, lat: s.lat ?? null, lng: s.lng ?? null, sites: entries.length, files };
}

export class VaultMarkdownLoop extends WorkflowEntrypoint<WfEnv, Record<string, never>> {
  async run(_event: WorkflowEvent<Record<string, never>>, step: WorkflowStep) {
    const sites = await step.do("load-inventory", async () =>
      ((await loadInventory(this.env.CAMPSITES)) as unknown as Site[]).filter((s) => s.collect !== false),
    );
    const manifest: ManifestEntry[] = [];
    for (const s of sites) {
      const entry = await step.do(`gen-${s.id}`, { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "2 minutes" }, () => genCampground(this.env, s));
      if (entry) manifest.push(entry);
    }
    await step.do("manifest", async () => {
      await this.env.VAULT.put("manifest.json", JSON.stringify({ updated_at: new Date().toISOString(), campgrounds: manifest }, null, 1));
      return { campgrounds: manifest.length, notes: manifest.reduce((n, m) => n + m.sites, 0) };
    });
    await step.sleep("daily", "24 hours");
    await step.do("continue-as-new", async () => {
      await this.env.VAULT_WF.create({ params: {} });
      return { handedOff: true };
    });
    return { campgrounds: manifest.length };
  }
}
