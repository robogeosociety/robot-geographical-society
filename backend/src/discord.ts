/**
 * Discord webhook notifications for campsite availability changes.
 *
 * Detects state changes (unavailable → available) by comparing the current
 * collection snapshot against the previous one in R2, then posts a rich embed
 * to a Discord channel via webhook.
 *
 * Integration: called from the CollectorLoop after a successful collectSite().
 * Requires the DISCORD_WEBHOOK_URL env var (a secret — add via `wrangler secret`).
 *
 * Design choices:
 *   - Change detection compares summary/<prevDate>/<id>.json vs the just-written
 *     summary/<date>/<id>.json. A date with 0 available yesterday and >0 today
 *     (or absent yesterday) is a "newly available" event.
 *   - Only fires on availability gains (not losses) to keep the channel useful.
 *   - Embeds are green (#2ecc71) for availability, with campground/park info.
 *   - Rate-limited: Discord webhooks allow 30 req/min; the collector does ≤1 site
 *     per wake (MAX_BATCH=1) so we're well within limits.
 */

import type { ByDate } from "./availability";

// --- Types -------------------------------------------------------------------

export type AvailabilityChange = {
  date: string;           // YYYY-MM-DD
  previousAvailable: number;
  currentAvailable: number;
  total: number;
};

export type SiteInfo = {
  id: string;
  name: string;
  agency: string;
  kind: "rec" | "wa";
  ref?: string | number | null; // provider id (numeric rec.gov campground id / WA resourceLocation id)
  lat?: number | null;
  lng?: number | null;
  reservation_url?: string | null;
};

// Shape of the R2 `summary/<date>/<id>.json` object written by collectSite().
type SummarySnapshot = { by_date?: ByDate };

export type DiscordEmbed = {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
  url?: string;
};

// --- Change detection --------------------------------------------------------

/**
 * Compare two by_date snapshots and return dates where availability appeared
 * (was 0 or absent, now > 0). Only looks at dates from today onward.
 */
export function detectChanges(
  prev: ByDate | null,
  current: ByDate,
  today?: string,
): AvailabilityChange[] {
  const cutoff = today ?? new Date().toISOString().slice(0, 10);
  const changes: AvailabilityChange[] = [];

  for (const [date, counts] of Object.entries(current)) {
    if (date < cutoff) continue; // ignore past dates
    if (counts.available <= 0) continue; // nothing opened up

    const prevCounts = prev?.[date];
    const prevAvail = prevCounts?.available ?? 0;

    // Fire when availability appeared (was 0 or missing, now > 0).
    if (prevAvail === 0 && counts.available > 0) {
      changes.push({
        date,
        previousAvailable: prevAvail,
        currentAvailable: counts.available,
        total: counts.total,
      });
    }
  }

  return changes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Load the previous summary snapshot from R2 for comparison. Walks the recent
 * date-partitions (newest first, excluding `currentDate`) to find the most
 * recent prior snapshot for this site.
 */
export async function loadPreviousSummary(
  raw: R2Bucket,
  siteId: string,
  currentDate: string,
  lookbackDays = 7,
): Promise<ByDate | null> {
  // Generate candidate dates (yesterday back to lookbackDays ago).
  const candidates: string[] = [];
  const base = new Date(`${currentDate}T00:00:00Z`);
  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(base.getTime() - i * 86_400_000);
    candidates.push(d.toISOString().slice(0, 10));
  }

  for (const d of candidates) {
    const obj = await raw.get(`summary/${d}/${siteId}.json`);
    if (obj) {
      const snap = await obj.json<SummarySnapshot>();
      return snap?.by_date ?? null;
    }
  }
  return null;
}

// --- Discord embed formatting ------------------------------------------------

const GREEN = 0x2ecc71;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${day}, ${month} ${d}`;
}

function reservationUrl(site: SiteInfo): string | null {
  if (site.reservation_url) return site.reservation_url;
  if (site.kind === "rec") {
    // rec.gov campground URLs are keyed by the numeric provider id (the inventory
    // `ref`, e.g. 233864) — NOT the agency slug id (e.g. "usfs/middle-fork"), which
    // would 404. Fall back to the id only if no ref is available.
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

/**
 * Build a Discord embed for a batch of availability changes at one campground.
 */
export function buildEmbed(site: SiteInfo, changes: AvailabilityChange[]): DiscordEmbed {
  // Group changes into a readable list.
  const totalNewSites = changes.reduce((sum, c) => sum + c.currentAvailable, 0);
  const dateRange =
    changes.length === 1
      ? formatDate(changes[0].date)
      : `${formatDate(changes[0].date)} – ${formatDate(changes[changes.length - 1].date)}`;

  // Build per-date lines (cap at 15 to stay within Discord's 1024 char field limit).
  const dateLines = changes.slice(0, 15).map((c) => {
    const pct = c.total > 0 ? Math.round((c.currentAvailable / c.total) * 100) : 0;
    return `**${formatDate(c.date)}** — ${c.currentAvailable} of ${c.total} sites (${pct}% open)`;
  });
  if (changes.length > 15) {
    dateLines.push(`_…and ${changes.length - 15} more dates_`);
  }

  const url = reservationUrl(site);

  return {
    title: `🏕️ ${site.name} — Sites Available!`,
    description: `**${totalNewSites}** campsite-night${totalNewSites === 1 ? "" : "s"} just opened up across **${changes.length}** date${changes.length === 1 ? "" : "s"}.`,
    color: GREEN,
    url: url ?? undefined,
    fields: [
      {
        name: "Park / Agency",
        value: agencyLabel(site),
        inline: true,
      },
      {
        name: "Dates",
        value: dateRange,
        inline: true,
      },
      {
        name: "Availability",
        value: dateLines.join("\n"),
        inline: false,
      },
      ...(url
        ? [{ name: "Book Now", value: `[Reserve →](${url})`, inline: false }]
        : []),
    ],
    footer: { text: "Robot Geographical Society • Campsite Availability Monitor" },
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

/**
 * Send a Discord webhook message. Returns true on success, false on failure
 * (non-throwing — a notification failure should never break collection).
 */
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
    // Discord returns 204 No Content on success, or 200 with wait_until for rate limits.
    if (res.ok || res.status === 204) return true;
    // Rate limited — log but don't retry (the next collection will catch it).
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

// --- Main entry point (called from the collector) ----------------------------

export type NotifyEnv = {
  RAW: R2Bucket;
  DISCORD_WEBHOOK_URL?: string;
};

/**
 * After a successful collection, detect availability changes and notify Discord.
 *
 * Call this from the CollectorLoop after collectSite() succeeds. It:
 *   1. Loads the previous summary snapshot from R2
 *   2. Loads the just-written current snapshot
 *   3. Detects dates where availability appeared (0 → >0)
 *   4. Posts a Discord embed if any changes found
 *
 * Non-throwing: notification failures are logged but never propagate to the caller.
 *
 * @param env       Worker env (needs RAW R2 bucket + DISCORD_WEBHOOK_URL secret)
 * @param site      The collected site's metadata
 * @param date      Today's collection date (YYYY-MM-DD)
 * @returns         { notified: boolean, changes: number }
 */
export async function notifyAvailabilityChanges(
  env: NotifyEnv,
  site: SiteInfo,
  date: string,
): Promise<{ notified: boolean; changes: number }> {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { notified: false, changes: 0 };

  try {
    // 1. Load the previous snapshot for comparison.
    const prev = await loadPreviousSummary(env.RAW, site.id, date);

    // 2. Load the current (just-written) snapshot.
    const currentObj = await env.RAW.get(`summary/${date}/${site.id}.json`);
    if (!currentObj) return { notified: false, changes: 0 };
    const current = await currentObj.json<SummarySnapshot>();
    const currentBy: ByDate = current?.by_date ?? {};

    // 3. Detect changes.
    const changes = detectChanges(prev, currentBy, date);
    if (changes.length === 0) return { notified: false, changes: 0 };

    // 4. Build and send the Discord notification.
    const embed = buildEmbed(site, changes);
    const payload: DiscordWebhookPayload = {
      username: "Campsite Bot",
      avatar_url: "https://em-content.zobj.net/source/apple/391/national-park_1f3de-fe0f.png",
      embeds: [embed],
    };
    const sent = await sendWebhook(webhookUrl, payload);
    return { notified: sent, changes: changes.length };
  } catch (err) {
    console.error(`notifyAvailabilityChanges failed for ${site.id}: ${err}`);
    return { notified: false, changes: 0 };
  }
}
