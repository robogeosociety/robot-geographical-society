/**
 * Deadline-driven collection scheduling — pure, testable core (no I/O).
 *
 * The collector keeps a per-site deadline `due[siteId]` and only ever collects
 * sites whose deadline has arrived ("distributed skipping"). These helpers decide
 * what's due, when to wake next, and how to (re)seed deadlines so that every site
 * is refreshed within X ms while load stays spread and interleaved across booking
 * systems. See SCHEDULER-PLAN.md.
 *
 * All functions are pure (time is passed in) so the durable Workflow can call them
 * inside replay-safe steps and they can be unit-tested deterministically.
 */

export type DueMap = Record<string, number>; // siteId → epoch ms deadline
export type FailMap = Record<string, number>; // siteId → consecutive failure count
type S = { id: string; kind: string };

/**
 * Exponential retry delay for a site that has failed `fails` times in a row
 * (fails ≥ 1): baseMs, 2·baseMs, 4·baseMs … capped at capMs. A transient outage
 * that recovers within an hour or so is retried progressively later instead of
 * being hammered on a fixed cadence, so a single broken site can never make up a
 * large share of collection attempts. The caller adds ±jitter to avoid lockstep.
 */
export function retryBackoffMs(fails: number, baseMs: number, capMs: number): number {
  const n = Math.max(1, fails);
  // 2^(n-1) without overflow at large n: clamp the exponent, then cap the result.
  const factor = n - 1 >= 30 ? Infinity : 2 ** (n - 1);
  return Math.min(capMs, baseMs * factor);
}

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic ±30 min per-site offset, so reschedules don't fall into lockstep. */
export function jitterMs(id: string): number {
  const J = 30 * 60_000;
  return (hashStr(id) % (2 * J)) - J;
}

/** Round-robin merge of sites grouped by booking system → interleaved order. */
export function interleaveBySystem<T extends S>(sites: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const s of sites) {
    const g = groups.get(s.kind);
    if (g) g.push(s);
    else groups.set(s.kind, [s]);
  }
  const lists = [...groups.values()];
  const out: T[] = [];
  for (let i = 0; out.length < sites.length; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

/**
 * Cold start: prime the first `prime` sites for immediate collection (prompt
 * baseline), and spread the remainder uniformly across [now, now+X) so steady
 * state is evenly distributed and interleaved across systems.
 */
export function seedDue<T extends S>(sites: T[], X: number, now: number, prime = 8, inactive?: Set<string>): DueMap {
  const order = interleaveBySystem(activeOnly(sites, inactive));
  const due: DueMap = {};
  order.forEach((s, r) => {
    due[s.id] = r < prime ? now : now + Math.round((r / order.length) * X);
  });
  return due;
}

/**
 * Recovery: keep deadlines for known sites; spread any new sites across [now, now+X).
 * Inactive (quarantined) sites are excluded entirely — they live in the DLQ, not the
 * due map, so a restart never resurrects a site we deliberately disabled.
 */
export function mergeDue<T extends S>(prev: DueMap, sites: T[], X: number, now: number, inactive?: Set<string>): DueMap {
  const order = interleaveBySystem(activeOnly(sites, inactive));
  const due: DueMap = {};
  order.forEach((s, r) => {
    due[s.id] = s.id in prev ? prev[s.id] : now + Math.round((r / order.length) * X);
  });
  return due;
}

/** Drop quarantined sites from a fleet list. */
function activeOnly<T extends S>(sites: T[], inactive?: Set<string>): T[] {
  return inactive && inactive.size ? sites.filter((s) => !inactive.has(s.id)) : sites;
}

/**
 * Sites whose deadline is within `now + slackMs`, soonest-first, capped at maxBatch.
 * A site absent from `due` (e.g. quarantined) is never selected — absence is not
 * "infinitely overdue".
 */
export function selectDue<T extends S>(due: DueMap, sites: T[], now: number, slackMs: number, maxBatch: number): string[] {
  return sites
    .filter((s) => due[s.id] !== undefined && due[s.id] <= now + slackMs)
    .sort((a, b) => due[a.id] - due[b.id])
    .slice(0, maxBatch)
    .map((s) => s.id);
}

/** Time to sleep until the soonest deadline, clamped to [minMs, maxMs]. */
export function nextSleepMs(due: DueMap, now: number, minMs: number, maxMs: number): number {
  const vals = Object.values(due);
  if (!vals.length) return maxMs;
  return Math.max(minMs, Math.min(maxMs, Math.min(...vals) - now));
}
