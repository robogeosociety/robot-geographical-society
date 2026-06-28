/**
 * Subscription-based campsite notifications.
 *
 * Users subscribe to specific campground + optional site label + date pattern.
 * After each collection, matched subscriptions fire a targeted Discord alert.
 * Subscriptions are stored in KV under the `sub:` prefix.
 */

import type { BySite, SiteStatus } from "./availability";

// --- Types -------------------------------------------------------------------

export type Subscription = {
  id: string;
  campgroundId: string;       // e.g. "usfs/middle-fork"
  siteLabel?: string | null;  // e.g. "24" — null/omitted = any site
  dates?: string[];           // specific dates ["2026-07-04"] — omit for pattern-only
  weekdays?: number[];        // 0=Sun … 6=Sat — e.g. [0, 6] for weekends
  note?: string;              // human-readable label
  createdAt: string;
};

export type SiteMatch = {
  siteId: string;
  label: string | null;
  date: string;
  status: SiteStatus;
};

const SUB_PREFIX = "sub:";

// --- KV CRUD -----------------------------------------------------------------

export async function listSubscriptions(kv: KVNamespace): Promise<Subscription[]> {
  const keys = await kv.list({ prefix: SUB_PREFIX });
  const subs: Subscription[] = [];
  for (const k of keys.keys) {
    const raw = await kv.get(k.name, { type: "json" });
    if (raw) subs.push(raw as Subscription);
  }
  return subs;
}

export async function getSubscription(kv: KVNamespace, id: string): Promise<Subscription | null> {
  return kv.get(`${SUB_PREFIX}${id}`, { type: "json" });
}

export async function putSubscription(kv: KVNamespace, sub: Subscription): Promise<void> {
  await kv.put(`${SUB_PREFIX}${sub.id}`, JSON.stringify(sub));
}

export async function deleteSubscription(kv: KVNamespace, id: string): Promise<boolean> {
  const exists = (await kv.get(`${SUB_PREFIX}${id}`)) !== null;
  await kv.delete(`${SUB_PREFIX}${id}`);
  return exists;
}

// --- Matching ----------------------------------------------------------------

function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Does this date match the subscription's date/weekday filters? */
export function dateMatches(sub: Subscription, date: string): boolean {
  if (sub.dates?.length) {
    if (sub.dates.includes(date)) return true;
    // If specific dates are set but don't match, fall through to weekday check
    // only if weekdays are also set (OR logic between the two).
    if (!sub.weekdays?.length) return false;
  }
  if (sub.weekdays?.length) {
    return sub.weekdays.includes(dayOfWeek(date));
  }
  // No date/weekday filter → matches all dates.
  return true;
}

/** Does this campsite label match the subscription? */
export function siteMatches(sub: Subscription, label: string | null): boolean {
  if (!sub.siteLabel) return true; // no filter → all sites
  if (!label) return false;       // filter set, but site has no label
  return label.toLowerCase() === sub.siteLabel.toLowerCase();
}

/**
 * Given the per-site availability for a campground (current and previous),
 * find individual site+date pairs that became available and match at least
 * one subscription.
 */
export function matchSubscriptions(
  campgroundId: string,
  currentSites: BySite,
  previousSites: BySite | null,
  subs: Subscription[],
  today: string,
): Map<Subscription, SiteMatch[]> {
  const relevant = subs.filter((s) => s.campgroundId === campgroundId);
  if (!relevant.length) return new Map();

  const result = new Map<Subscription, SiteMatch[]>();

  for (const [siteId, current] of Object.entries(currentSites)) {
    const prevSite = previousSites?.[siteId];

    for (const [date, status] of Object.entries(current.by_date)) {
      if (date < today) continue;
      if (status !== "available") continue;

      // Was it previously unavailable (reserved/other/absent)?
      const prevStatus = prevSite?.by_date?.[date];
      if (prevStatus === "available") continue; // already available, not new

      // This site+date is newly available. Check against subscriptions.
      for (const sub of relevant) {
        if (!siteMatches(sub, current.label)) continue;
        if (!dateMatches(sub, date)) continue;

        const matches = result.get(sub) ?? [];
        matches.push({ siteId, label: current.label, date, status });
        result.set(sub, matches);
      }
    }
  }

  // Sort each subscription's matches by date then label.
  for (const matches of result.values()) {
    matches.sort((a, b) => a.date.localeCompare(b.date) || (a.label ?? "").localeCompare(b.label ?? ""));
  }

  return result;
}
