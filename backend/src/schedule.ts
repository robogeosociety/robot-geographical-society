/**
 * Collection schedule generation — plan a highly distributed request pattern.
 *
 * Goals:
 *  1. Spread each booking system's requests EVENLY across the whole window so no
 *     single host sees a burst. Each system gets its own cadence (windowSec / N),
 *     independent of how many sites other systems have.
 *  2. INTERLEAVE systems in time so requests don't arrive in per-agency blocks —
 *     a rec.gov call, then a goingtocamp call, then rec.gov, etc.
 *  3. Avoid an identifiable day-to-day pattern: which site lands in which time
 *     slot is reshuffled every run, and the offset within each slot is jittered,
 *     so a given site is never collected at the same time two days running.
 *  4. Scale: generic over the grouping key, so adding campsites (or a whole new
 *     booking system) just reshapes the cadence — no code change.
 *
 * The function is pure (randomness is injected) so it can run inside a Workflow
 * `step.do` (its output is persisted → replay-safe) and be unit-tested with a
 * seeded PRNG.
 */

export type Scheduled<T> = { item: T; atSec: number };

/** Fisher–Yates shuffle into a new array, using the injected `rand`. */
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Plan when to collect each item within `[0, windowSec)`.
 *
 * Items are grouped by `groupBy` (the booking system / host). Each group of N
 * items is laid over N equal slots of width `windowSec / N`; each item is placed
 * at a uniformly-random offset inside its own slot. This guarantees exactly one
 * request per slot — even coverage with no clustering — while the in-slot jitter
 * plus a per-run reshuffle of the item→slot assignment make the timing vary
 * every run. Groups are then merged and sorted by time, interleaving systems.
 *
 * @returns items paired with an absolute offset (seconds from window start),
 *          ordered by that offset. `windowSec <= 0` returns every item at 0
 *          (immediate, unpaced run) in randomized order.
 */
export function planSchedule<T>(
  items: T[],
  opts: { windowSec: number; groupBy: (item: T) => string; rand?: () => number },
): Scheduled<T>[] {
  const { windowSec, groupBy, rand = Math.random } = opts;

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = groupBy(item);
    const g = groups.get(key);
    if (g) g.push(item);
    else groups.set(key, [item]);
  }

  const planned: Scheduled<T>[] = [];
  for (const group of groups.values()) {
    const n = group.length;
    const slot = windowSec > 0 ? windowSec / n : 0;
    // Reshuffle which site occupies which slot so per-site timing isn't fixed.
    const order = shuffle(group, rand);
    for (let i = 0; i < n; i++) {
      // Uniform offset inside slot i → even spread, randomized within the slot.
      const at = slot > 0 ? Math.min(windowSec - 1, Math.round((i + rand()) * slot)) : 0;
      planned.push({ item: order[i], atSec: at });
    }
  }

  // Shuffle before the stable sort so equal-time ties interleave across systems
  // instead of falling back to group insertion order.
  const merged = shuffle(planned, rand);
  merged.sort((a, b) => a.atSec - b.atSec);
  return merged;
}
