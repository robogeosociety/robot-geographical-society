import { expect, test, describe } from 'vitest';
import {
  foldCampground,
  finalize,
  mergePartials,
  medianFromHist,
  emptyPartial,
  type CampgroundFile,
} from './readiness';

// One campground, three collection dates. Cells:
//   (A,s1,07-01): available→available→reserved  → 2 intervals, SOLD   (depth 2, event)
//   (A,s1,07-02): reserved→available→other      → 1 interval,  no sell (depth 1)
//   (A,s2,07-01): reserved→reserved→reserved     → 0 intervals          (counted, inactive)
const FILES: CampgroundFile[] = [
  {
    id: 'A',
    collected_date: '2026-06-01',
    sites: { s1: { by_date: { '2026-07-01': 'available', '2026-07-02': 'reserved' } }, s2: { by_date: { '2026-07-01': 'reserved' } } },
  },
  {
    id: 'A',
    collected_date: '2026-06-02',
    sites: { s1: { by_date: { '2026-07-01': 'available', '2026-07-02': 'available' } }, s2: { by_date: { '2026-07-01': 'reserved' } } },
  },
  {
    id: 'A',
    collected_date: '2026-06-03',
    sites: { s1: { by_date: { '2026-07-01': 'reserved', '2026-07-02': 'other' } }, s2: { by_date: { '2026-07-01': 'reserved' } } },
  },
];

describe('foldCampground — at-risk interval / sell-out logic', () => {
  test('counts cells, active, events and the depth histogram', () => {
    const p = foldCampground(FILES);
    expect(p.cells).toBe(3); // every (cg,site,target) tuple
    expect(p.active).toBe(2); // the two with ≥1 at-risk interval
    expect(p.events).toBe(1); // only s1/07-01 hit available→reserved
    expect(p.campgrounds).toBe(1);
    expect(p.depthHist).toEqual({ '1': 1, '2': 1 }); // depth-1 ×1 (s1/07-02), depth-2 ×1 (s1/07-01)
  });

  test('available→other stops the cell without an event', () => {
    const p = foldCampground([
      { id: 'X', collected_date: 'd1', sites: { s: { by_date: { t: 'available' } } } },
      { id: 'X', collected_date: 'd2', sites: { s: { by_date: { t: 'other' } } } },
    ]);
    expect(p.events).toBe(0);
    expect(p.active).toBe(1);
    expect(p.depthHist).toEqual({ '1': 1 });
  });
});

describe('finalize — geometric-mean gauge + derived fields (parity with readiness.py)', () => {
  const row = finalize(foldCampground(FILES), ['2026-06-01', '2026-06-02', '2026-06-03']);

  test('counts and median', () => {
    expect(row.cells).toBe(3);
    expect(row.active_cells).toBe(2);
    expect(row.events).toBe(1);
    expect(row.median_depth).toBe(2);
    expect(row.collect_days).toBe(3);
    expect(row.campgrounds).toBe(1);
  });

  test('component scores and the cube-root readiness', () => {
    expect(row.event_score).toBeCloseTo(0.002, 6); // 1/500
    expect(row.coverage).toBeCloseTo(2 / 3, 6);
    expect(row.depth_score).toBeCloseTo(1 / 3, 6); // 2/6
    expect(row.readiness).toBeCloseTo(Math.cbrt(0.002 * (2 / 3) * (1 / 3)), 6);
    expect(row.band).toBe('insufficient');
  });

  test('history span → expected accuracy + ready ETA countdown', () => {
    expect(row.history_months).toBeCloseTo(2 / 30, 6);
    expect(row.expected_accuracy).toBeCloseTo(0.5 + 0.34 * (1 - Math.exp(-(2 / 30) / 3)), 6);
    expect(row.ready_eta_days).toBe(191);
  });
});

describe('medianFromHist — exact median from the histogram', () => {
  test('matches sorted-array median at index floor(n/2)', () => {
    expect(medianFromHist({ '1': 1, '2': 1, '3': 1 })).toBe(2); // [1,2,3] → idx 1
    expect(medianFromHist({ '1': 1, '2': 1, '3': 1, '4': 1 })).toBe(3); // [1,2,3,4] → idx 2
    expect(medianFromHist({ '5': 3 })).toBe(5);
    expect(medianFromHist({})).toBe(0);
  });
});

describe('mergePartials — combine across campground batches', () => {
  test('sums scalars and merges histograms', () => {
    const a = { cells: 2, active: 1, events: 1, campgrounds: 1, depthHist: { '2': 1 } };
    const b = { cells: 3, active: 2, events: 0, campgrounds: 1, depthHist: { '2': 1, '5': 1 } };
    expect(mergePartials(a, b)).toEqual({ cells: 5, active: 3, events: 1, campgrounds: 2, depthHist: { '2': 2, '5': 1 } });
  });

  test('emptyPartial is the identity', () => {
    const a = { cells: 1, active: 1, events: 0, campgrounds: 1, depthHist: { '1': 1 } };
    expect(mergePartials(emptyPartial(), a)).toEqual(a);
  });
});
