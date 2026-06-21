import { describe, test, expect } from 'vitest';
import { bookedPct, latestFill, curvePoints, curveGeometry, rankWatches, fillColor } from './watch';

describe('bookedPct', () => {
  test('reserved / total, including "other" in the denominator', () => {
    expect(bookedPct({ reserved: 6, total: 10 })).toBe(0.6);
  });
  test('0 when nothing captured', () => {
    expect(bookedPct({ reserved: 0, total: 0 })).toBe(0);
    expect(bookedPct()).toBe(0);
  });
});

describe('latestFill', () => {
  test('uses the last observed point', () => {
    const curve = { points: [{ reserved: 2, total: 10 }, { reserved: 9, total: 10 }] };
    expect(latestFill(curve)).toBe(0.9);
  });
  test('falls back to a summary `fill` when there are no points', () => {
    expect(latestFill({ points: [], fill: 0.4 })).toBe(0.4);
    expect(latestFill({})).toBe(0);
  });
});

describe('curvePoints', () => {
  const points = [
    { ts: 't0', available: 8, reserved: 2, total: 10 },
    { ts: 't1', available: 4, reserved: 6, total: 10 },
    { ts: 't2', available: 0, reserved: 10, total: 10 },
  ];
  test('attaches booked pct and an even x in [0,1]', () => {
    const out = curvePoints(points);
    expect(out.map((p) => p.pct)).toEqual([0.2, 0.6, 1]);
    expect(out.map((p) => p.x)).toEqual([0, 0.5, 1]);
  });
  test('single point sits at x=0; empty → []', () => {
    expect(curvePoints([{ reserved: 1, total: 2 }])[0].x).toBe(0);
    expect(curvePoints([])).toEqual([]);
  });
});

describe('curveGeometry', () => {
  test('builds line + area point strings in the padded box', () => {
    const g = curveGeometry(
      [{ reserved: 0, total: 10 }, { reserved: 10, total: 10 }],
      { width: 100, height: 50, pad: 0 },
    );
    // 0% booked at the bottom (y=50), 100% at the top (y=0), x spans full width.
    expect(g.line).toBe('0.0,50.0 100.0,0.0');
    // Area closes down to the baseline at both ends.
    expect(g.area).toBe('0.0,50.0 0.0,50.0 100.0,0.0 100.0,50.0');
  });
  test('empty series → null', () => {
    expect(curveGeometry([])).toBeNull();
  });
});

describe('rankWatches', () => {
  const watches = [
    { guid: 'a', target_date: '2026-07-04', points: [{ reserved: 2, total: 10 }] }, // 20%
    { guid: 'b', target_date: '2026-07-04', points: [{ reserved: 10, total: 10 }] }, // 100%
    { guid: 'c', target_date: '2026-06-01', points: [{ reserved: 5, total: 10 }] }, // 50%
  ];
  test('hottest first, ties by soonest target night', () => {
    expect(rankWatches(watches).map((w) => w.guid)).toEqual(['b', 'c', 'a']);
  });
  test('does not mutate the input', () => {
    const copy = [...watches];
    rankWatches(watches);
    expect(watches).toEqual(copy);
  });
});

describe('fillColor', () => {
  test('hot → red, mid → amber, cold → green', () => {
    expect(fillColor(0.9)).toBe('#F85149');
    expect(fillColor(0.5)).toBe('#D29922');
    expect(fillColor(0.1)).toBe('#3FB950');
  });
});
