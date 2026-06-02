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
type S = { id: string; kind: string };

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
export function seedDue<T extends S>(sites: T[], X: number, now: number, prime = 8): DueMap {
  const order = interleaveBySystem(sites);
  const due: DueMap = {};
  order.forEach((s, r) => {
    due[s.id] = r < prime ? now : now + Math.round((r / order.length) * X);
  });
  return due;
}

/** Recovery: keep deadlines for known sites; spread any new sites across [now, now+X). */
export function mergeDue<T extends S>(prev: DueMap, sites: T[], X: number, now: number): DueMap {
  const order = interleaveBySystem(sites);
  const due: DueMap = {};
  order.forEach((s, r) => {
    due[s.id] = s.id in prev ? prev[s.id] : now + Math.round((r / order.length) * X);
  });
  return due;
}

/** Sites whose deadline is within `now + slackMs`, soonest-first, capped at maxBatch. */
export function selectDue<T extends S>(due: DueMap, sites: T[], now: number, slackMs: number, maxBatch: number): string[] {
  return sites
    .filter((s) => (due[s.id] ?? 0) <= now + slackMs)
    .sort((a, b) => (due[a.id] ?? 0) - (due[b.id] ?? 0))
    .slice(0, maxBatch)
    .map((s) => s.id);
}

/** Time to sleep until the soonest deadline, clamped to [minMs, maxMs]. */
export function nextSleepMs(due: DueMap, now: number, minMs: number, maxMs: number): number {
  const vals = Object.values(due);
  if (!vals.length) return maxMs;
  return Math.max(minMs, Math.min(maxMs, Math.min(...vals) - now));
}
