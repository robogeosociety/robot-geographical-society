/**
 * Discord webhook notifications for campsite availability changes.
 *
 * Two notification paths:
 *  1. Subscriptions — per-site changes matching an active subscription
 *     (campground + optional site label + date/weekday filters).
 *  2. "Hottest" feed — any availability opening at a high-demand campground
 *     (fill rate ≥ threshold). Enabled by default, no subscription needed.
 *
 * Integration: called from the CollectorLoop after a successful collectSite().
 * Requires the DISCORD_WEBHOOK_URL env var (a secret — add via `wrangler secret`).
 */

import type { ByDate, BySite } from "./availability";
import { listSubscriptions, matchSubscriptions, type Subscription, type SiteMatch } from "./subscriptions";

// --- Types -------------------------------------------------------------------

export type SiteInfo = {
  id: string;
  name: string;
  agency: string;
  kind: "rec" | "wa";
  ref?: string | number | null;
  lat?: number | null;
  lng?: number | null;
  reservation_url?: string | null;
};

export type DiscordEmbed = {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
  url?: string;
};

// --- Helpers -----------------------------------------------------------------

const GREEN = 0x2ecc71;

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${day}, ${month} ${d}`;
}

export function reservationUrl(site: SiteInfo): string | null {
  if (site.reservation_url) return site.reservation_url;
  if (site.kind === "rec") {
    return `https://www.recreation.gov/camping/campgrounds/${site.ref ?? site.id}`;
  }
  if (site.kind === "wa") {
    return `https://washington.goingtocamp.com/`;
  }
  return null;
}

function agencyLabel(site: SiteInfo): string {
  const labels: Record<string, string> = {
    usfs: "US Forest Service",
    nps: "National Park Service",
    wa: "Washington State Parks",
    blm: "Bureau of Land Management",
  };
  return labels[site.agency] ?? site.agency;
}

// --- Fill-rate / "hottest" feed -----------------------------------------------

const HOT_FILL_DEFAULT = 0.9;
const FIRE = 0xff4500; // orange-red

export function computeFillRate(byDate: ByDate, today: string): number {
  const entries = Object.entries(byDate).filter(([d]) => d >= today);
  if (entries.length === 0) return 0;
  const full = entries.filter(([, c]) => c.available === 0).length;
  return full / entries.length;
}

export function buildHotEmbed(
  site: SiteInfo,
  fillRate: number,
  matches: SiteMatch[],
): DiscordEmbed {
  const pct = Math.round(fillRate * 100);
  const lines = matches.slice(0, 15).map((m) => {
    const siteStr = m.label ? `Site ${m.label}` : `Site ${m.siteId}`;
    return `**${formatDate(m.date)}** — ${siteStr}`;
  });
  if (matches.length > 15) {
    lines.push(`_…and ${matches.length - 15} more_`);
  }
  const url = reservationUrl(site);
  return {
    title: `🔥 ${site.name} — Rare Opening!`,
    description: `This campground is **${pct}% full** across all future dates. **${matches.length}** site-night${matches.length === 1 ? "" : "s"} just opened up — book fast.`,
    color: FIRE,
    url: url ?? undefined,
    fields: [
      { name: "Park / Agency", value: agencyLabel(site), inline: true },
      { name: "Fill Rate", value: `${pct}%`, inline: true },
      { name: "Availability", value: lines.join("\n"), inline: false },
      ...(url ? [{ name: "Book Now", value: `[Reserve →](${url})`, inline: false }] : []),
    ],
    footer: { text: "Robot Geographical Society • Hot Campground Alert" },
    timestamp: new Date().toISOString(),
  };
}

export async function notifyHotCampground(
  env: NotifyEnv & { HOT_FILL_THRESHOLD?: string },
  site: SiteInfo,
  date: string,
): Promise<{ notified: boolean; hot: boolean; fillRate: number }> {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { notified: false, hot: false, fillRate: 0 };

  try {
    const summaryObj = await env.RAW.get(`summary/${date}/${site.id}.json`);
    if (!summaryObj) return { notified: false, hot: false, fillRate: 0 };
    const summary = await summaryObj.json<{ by_date?: ByDate }>();
    const byDate = summary?.by_date ?? {};

    const fillRate = computeFillRate(byDate, date);
    const threshold = parseFloat(env.HOT_FILL_THRESHOLD ?? "") || HOT_FILL_DEFAULT;
    if (fillRate < threshold) return { notified: false, hot: false, fillRate };

    // Hot campground — check for reserved→available transitions
    const currentObj = await env.RAW.get(`sites/${date}/${site.id}.json`);
    if (!currentObj) return { notified: false, hot: true, fillRate };
    const currentSnap = await currentObj.json<{ sites?: BySite }>();
    const currentSites = currentSnap?.sites ?? {};

    const previousSites = await loadPreviousSites(env.RAW, site.id, date);

    const matches: SiteMatch[] = [];
    for (const [siteId, info] of Object.entries(currentSites)) {
      for (const [d, status] of Object.entries(info.by_date)) {
        if (d < date) continue;
        if (status !== "available") continue;
        const prev = previousSites?.[siteId]?.by_date?.[d];
        if (prev && prev === "available") continue; // already was available
        matches.push({ siteId, label: info.label, date: d, status });
      }
    }

    if (matches.length === 0) return { notified: false, hot: true, fillRate };

    matches.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));

    const embed = buildHotEmbed(site, fillRate, matches);
    const payload: DiscordWebhookPayload = {
      username: "Campsite Bot",
      avatar_url: "https://em-content.zobj.net/source/apple/391/national-park_1f3de-fe0f.png",
      embeds: [embed],
    };
    const sent = await sendWebhook(webhookUrl, payload);
    return { notified: sent, hot: true, fillRate };
  } catch (err) {
    console.error(`notifyHotCampground failed for ${site.id}: ${err}`);
    return { notified: false, hot: false, fillRate: 0 };
  }
}

// --- Subscription embed building ---------------------------------------------

export function buildSubscriptionEmbed(
  site: SiteInfo,
  sub: Subscription,
  matches: SiteMatch[],
): DiscordEmbed {
  const uniqueDates = [...new Set(matches.map((m) => m.date))];
  const uniqueSites = [...new Set(matches.map((m) => m.label).filter(Boolean))] as string[];

  const dateRange =
    uniqueDates.length === 1
      ? formatDate(uniqueDates[0])
      : `${formatDate(uniqueDates[0])} – ${formatDate(uniqueDates[uniqueDates.length - 1])}`;

  const lines = matches.slice(0, 15).map((m) => {
    const siteStr = m.label ? `Site ${m.label}` : `Site ${m.siteId}`;
    return `**${formatDate(m.date)}** — ${siteStr}`;
  });
  if (matches.length > 15) {
    lines.push(`_…and ${matches.length - 15} more_`);
  }

  const url = reservationUrl(site);
  const titleSite = sub.siteLabel ? ` Site ${sub.siteLabel}` : "";
  const subNote = sub.note ? ` (${sub.note})` : "";

  return {
    title: `🏕️ ${site.name}${titleSite} — Available!`,
    description: `**${matches.length}** campsite-night${matches.length === 1 ? "" : "s"} opened up matching your subscription${subNote}.`,
    color: GREEN,
    url: url ?? undefined,
    fields: [
      { name: "Park / Agency", value: agencyLabel(site), inline: true },
      { name: "Dates", value: dateRange, inline: true },
      ...(uniqueSites.length > 0
        ? [{ name: "Sites", value: uniqueSites.join(", "), inline: true }]
        : []),
      { name: "Availability", value: lines.join("\n"), inline: false },
      ...(url ? [{ name: "Book Now", value: `[Reserve →](${url})`, inline: false }] : []),
    ],
    footer: { text: "Robot Geographical Society • Campsite Subscription Alert" },
    timestamp: new Date().toISOString(),
  };
}

// --- Discord webhook dispatch ------------------------------------------------

export interface DiscordWebhookPayload {
  content?: string;
  embeds: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

export async function sendWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok || res.status === 204) return true;
    if (res.status === 429) {
      console.warn(`Discord rate limited (429), skipping notification`);
      return false;
    }
    console.error(`Discord webhook failed: ${res.status} ${res.statusText}`);
    return false;
  } catch (err) {
    console.error(`Discord webhook error: ${err}`);
    return false;
  }
}

// --- Previous sites snapshot loading -----------------------------------------

type SitesSnapshot = { sites?: BySite };

export async function loadPreviousSites(
  raw: R2Bucket,
  siteId: string,
  currentDate: string,
  lookbackDays = 7,
): Promise<BySite | null> {
  const base = new Date(`${currentDate}T00:00:00Z`);
  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(base.getTime() - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const obj = await raw.get(`sites/${dateStr}/${siteId}.json`);
    if (obj) {
      const snap = await obj.json<SitesSnapshot>();
      return snap?.sites ?? null;
    }
  }
  return null;
}

// --- Main entry point (called from the collector) ----------------------------

export type NotifyEnv = {
  RAW: R2Bucket;
  CAMPSITES: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
};

/**
 * After a successful collection, check per-site availability changes against
 * active subscriptions and send targeted Discord notifications.
 *
 * Only fires when a subscription matches (campground + site label + date/weekday
 * pattern). One embed per matched subscription.
 */
export async function notifySubscriptionMatches(
  env: NotifyEnv,
  site: SiteInfo,
  date: string,
): Promise<{ notified: number; matches: number }> {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { notified: 0, matches: 0 };

  try {
    const allSubs = await listSubscriptions(env.CAMPSITES);
    const relevant = allSubs.filter((s) => s.campgroundId === site.id);
    if (!relevant.length) return { notified: 0, matches: 0 };

    const currentObj = await env.RAW.get(`sites/${date}/${site.id}.json`);
    if (!currentObj) return { notified: 0, matches: 0 };
    const currentSnap = await currentObj.json<SitesSnapshot>();
    const currentSites = currentSnap?.sites ?? {};

    const previousSites = await loadPreviousSites(env.RAW, site.id, date);

    const matched = matchSubscriptions(site.id, currentSites, previousSites, relevant, date);
    if (matched.size === 0) return { notified: 0, matches: 0 };

    let notified = 0;
    let totalMatches = 0;
    for (const [sub, matches] of matched) {
      totalMatches += matches.length;
      const embed = buildSubscriptionEmbed(site, sub, matches);
      const payload: DiscordWebhookPayload = {
        username: "Campsite Bot",
        avatar_url: "https://em-content.zobj.net/source/apple/391/national-park_1f3de-fe0f.png",
        embeds: [embed],
      };
      if (await sendWebhook(webhookUrl, payload)) notified++;
    }

    return { notified, matches: totalMatches };
  } catch (err) {
    console.error(`notifySubscriptionMatches failed for ${site.id}: ${err}`);
    return { notified: 0, matches: 0 };
  }
}
