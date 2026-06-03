import { expect, test, describe } from 'vitest';
import { interleaveBySystem, seedDue, mergeDue, selectDue, nextSleepMs, jitterMs, retryBackoffMs } from './scheduler';

const X = 2 * 86_400_000; // 2 days in ms
const NOW = 1_700_000_000_000;

function fleet() {
  const s = [];
  for (let i = 0; i < 100; i++) s.push({ id: `rec-${i}`, kind: 'rec' });
  for (let i = 0; i < 40; i++) s.push({ id: `wa-${i}`, kind: 'wa' });
  return s;
}

describe('interleaveBySystem', () => {
  test('alternates booking systems and preserves every site', () => {
    const out = interleaveBySystem(fleet());
    expect(out).toHaveLength(140);
    expect(new Set(out.map((s) => s.id)).size).toBe(140);
    // No long single-system run at the front where both systems still have items.
    let maxRun = 1, run = 1;
    for (let i = 1; i < 80; i++) {
      run = out[i].kind === out[i - 1].kind ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
    }
    expect(maxRun).toBeLessThanOrEqual(3);
  });
});

describe('seedDue (cold start)', () => {
  const due = seedDue(fleet(), X, NOW, 8);
  test('primes the first 8 for immediate collection', () => {
    const immediate = Object.values(due).filter((d) => d === NOW).length;
    expect(immediate).toBe(8);
  });
  test('spreads the rest across [now, now+X) with every site present', () => {
    expect(Object.keys(due)).toHaveLength(140);
    const vals = Object.values(due);
    expect(Math.min(...vals)).toBe(NOW);
    expect(Math.max(...vals)).toBeLessThan(NOW + X);
    expect(Math.max(...vals)).toBeGreaterThan(NOW + X * 0.9); // reaches near the far end
  });
});

describe('selectDue', () => {
  const sites = fleet();
  test('returns only due sites, soonest-first, capped at maxBatch', () => {
    const due = seedDue(sites, X, NOW, 8);
    const picked = selectDue(due, sites, NOW, 30_000, 8);
    expect(picked).toHaveLength(8); // the 8 primed
    // all picked are due
    for (const id of picked) expect(due[id]).toBeLessThanOrEqual(NOW + 30_000);
  });
  test('skips everything when nothing is due yet', () => {
    const due: Record<string, number> = { a: NOW + 10 * 60_000 };
    expect(selectDue(due, [{ id: 'a', kind: 'rec' }], NOW, 30_000, 8)).toEqual([]);
  });
});

describe('nextSleepMs', () => {
  test('sleeps until the soonest deadline, clamped to [min,max]', () => {
    expect(nextSleepMs({ a: NOW + 5 * 60_000 }, NOW, 15_000, 6 * 3600_000)).toBe(5 * 60_000);
    expect(nextSleepMs({ a: NOW + 1_000 }, NOW, 15_000, 6 * 3600_000)).toBe(15_000); // min clamp
    expect(nextSleepMs({ a: NOW + 999 * 3600_000 }, NOW, 15_000, 6 * 3600_000)).toBe(6 * 3600_000); // max clamp
  });
});

describe('mergeDue (recovery)', () => {
  test('keeps known deadlines, spreads only new sites', () => {
    const prev = { 'rec-0': NOW + 999, 'rec-1': NOW + 1234 };
    const sites = [{ id: 'rec-0', kind: 'rec' }, { id: 'rec-1', kind: 'rec' }, { id: 'rec-2', kind: 'rec' }];
    const due = mergeDue(prev, sites, X, NOW);
    expect(due['rec-0']).toBe(NOW + 999);
    expect(due['rec-1']).toBe(NOW + 1234);
    expect(due['rec-2']).toBeGreaterThanOrEqual(NOW); // new site seeded
    expect(due['rec-2']).toBeLessThan(NOW + X);
  });
});

describe('jitterMs', () => {
  test('is deterministic and bounded to ±30 min', () => {
    expect(jitterMs('rec-5')).toBe(jitterMs('rec-5'));
    for (const id of ['rec-0', 'wa-3', 'x']) expect(Math.abs(jitterMs(id))).toBeLessThanOrEqual(30 * 60_000);
  });

  test('staleness bound holds: reschedule = now + X + jitter ≤ X + 30min', () => {
    const resched = NOW + X + jitterMs('rec-7');
    expect(resched - NOW).toBeLessThanOrEqual(X + 30 * 60_000);
    expect(resched - NOW).toBeGreaterThanOrEqual(X - 30 * 60_000);
  });
});

describe('retryBackoffMs (exponential)', () => {
  const BASE = 10 * 60_000; // 10 min
  const CAP = 6 * 3600_000; // 6 h

  test('doubles per consecutive failure', () => {
    expect(retryBackoffMs(1, BASE, CAP)).toBe(BASE); // 10m
    expect(retryBackoffMs(2, BASE, CAP)).toBe(2 * BASE); // 20m
    expect(retryBackoffMs(3, BASE, CAP)).toBe(4 * BASE); // 40m
    expect(retryBackoffMs(4, BASE, CAP)).toBe(8 * BASE); // 80m
  });

  test('clamps at the cap and never overflows for large counts', () => {
    expect(retryBackoffMs(99, BASE, CAP)).toBe(CAP);
    expect(retryBackoffMs(1000, BASE, CAP)).toBe(CAP);
    expect(Number.isFinite(retryBackoffMs(1000, BASE, CAP))).toBe(true);
  });

  test('treats fails<1 as the first attempt', () => {
    expect(retryBackoffMs(0, BASE, CAP)).toBe(BASE);
  });
});

describe('inactive-aware scheduling', () => {
  const inactive = new Set(['rec-3', 'wa-7']);

  test('seedDue excludes quarantined sites from the due map', () => {
    const due = seedDue(fleet(), X, NOW, 8, inactive);
    expect(Object.keys(due)).toHaveLength(138);
    expect(due['rec-3']).toBeUndefined();
    expect(due['wa-7']).toBeUndefined();
  });

  test('mergeDue never resurrects a quarantined site, even if it had a prior deadline', () => {
    const prev = { 'rec-3': NOW + 500, 'rec-0': NOW + 999 };
    const due = mergeDue(prev, fleet(), X, NOW, inactive);
    expect(due['rec-3']).toBeUndefined(); // quarantined → dropped despite prev deadline
    expect(due['rec-0']).toBe(NOW + 999); // active known site kept
  });

  test('selectDue ignores sites absent from due (not treated as infinitely overdue)', () => {
    // wa-7 is in the fleet but not in due (quarantined) → must never be selected.
    const due = seedDue(fleet(), X, NOW, 140, inactive); // all active sites due now
    const picked = selectDue(due, fleet(), NOW, 30_000, 140);
    expect(picked).not.toContain('wa-7');
    expect(picked).not.toContain('rec-3');
    expect(picked).toHaveLength(138);
  });
});
