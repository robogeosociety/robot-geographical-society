import { expect, test, describe } from 'vitest';
import { planSchedule } from './schedule';

// Deterministic PRNG (mulberry32) so the distribution assertions are stable.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 39 rec + 22 wa, mirroring the real index split.
function fixture() {
  const sites = [];
  for (let i = 0; i < 39; i++) sites.push({ id: `rec-${i}`, kind: 'rec' });
  for (let i = 0; i < 22; i++) sites.push({ id: `wa-${i}`, kind: 'wa' });
  return sites;
}

const WINDOW = 86400;
const plan = (rand: () => number) => planSchedule(fixture(), { windowSec: WINDOW, groupBy: (s) => s.kind, rand });
type Plan = ReturnType<typeof plan>;

describe('planSchedule', () => {
  test('every item appears exactly once', () => {
    const out = plan(seeded(1));
    expect(out).toHaveLength(61);
    const ids = out.map((s) => s.item.id).sort();
    expect(new Set(ids).size).toBe(61);
  });

  test('all offsets fall within the window and the result is time-ordered', () => {
    const out = plan(seeded(2));
    for (const s of out) {
      expect(s.atSec).toBeGreaterThanOrEqual(0);
      expect(s.atSec).toBeLessThan(WINDOW);
    }
    const times = out.map((s) => s.atSec);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test('each booking system is spread evenly across the whole window', () => {
    const out = plan(seeded(3));
    for (const kind of ['rec', 'wa']) {
      const times = out.filter((s) => s.item.kind === kind).map((s) => s.atSec);
      const firstHalf = times.filter((t) => t < WINDOW / 2).length;
      // Even spread → roughly half the system's requests in each half of the day.
      expect(Math.abs(firstHalf - times.length / 2)).toBeLessThanOrEqual(2);
      // Coverage spans the window, not bunched in one corner.
      expect(Math.min(...times)).toBeLessThan(WINDOW * 0.1);
      expect(Math.max(...times)).toBeGreaterThan(WINDOW * 0.9);
    }
  });

  test('systems are interleaved — no long single-system run', () => {
    const out = plan(seeded(4));
    let run = 1;
    let maxRun = 1;
    for (let i = 1; i < out.length; i++) {
      run = out[i].item.kind === out[i - 1].item.kind ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
    }
    // The old index-order plan had a run of 39. Interleaving keeps it short.
    expect(maxRun).toBeLessThanOrEqual(5);
  });

  test('different runs produce different timing (no fixed daily pattern)', () => {
    const a = plan(seeded(10));
    const b = plan(seeded(20));
    const at = (out: Plan, id: string) => out.find((s) => s.item.id === id)!.atSec;
    // The same site is collected at a materially different time across runs.
    const shifts = fixture().filter((_, i) => i % 7 === 0).map((s) => Math.abs(at(a, s.id) - at(b, s.id)));
    expect(Math.max(...shifts)).toBeGreaterThan(600);
  });

  test('same seed is deterministic (replay-safe inside a Workflow step)', () => {
    expect(plan(seeded(42))).toEqual(plan(seeded(42)));
  });

  test('scales: a larger fleet stays evenly spread', () => {
    const big = [];
    for (let i = 0; i < 500; i++) big.push({ id: `r${i}`, kind: 'rec' });
    const out = planSchedule(big, { windowSec: WINDOW, groupBy: (s) => s.kind, rand: seeded(7) });
    const times = out.map((s) => s.atSec);
    // ~one per slot of width 86400/500 ≈ 173s; gaps stay bounded, never a burst.
    let maxGap = 0;
    for (let i = 1; i < times.length; i++) maxGap = Math.max(maxGap, times[i] - times[i - 1]);
    expect(maxGap).toBeLessThan(WINDOW / 100);
  });

  test('windowSec <= 0 collapses to an immediate, unpaced run', () => {
    const out = planSchedule(fixture(), { windowSec: 0, groupBy: (s) => s.kind, rand: seeded(5) });
    expect(out).toHaveLength(61);
    expect(out.every((s) => s.atSec === 0)).toBe(true);
  });
});
