import { bucketAvailability } from './buckets';

// 9 nights spanning two ISO weeks and into July; mixed statuses.
const byDate = {
  '2026-06-29': 'available', // Mon (week A)
  '2026-06-30': 'reserved',  // Tue
  '2026-07-01': 'available', // Wed
  '2026-07-05': 'available', // Sun (still week A: Mon 06-29..Sun 07-05)
  '2026-07-06': 'reserved',  // Mon (week B)
  '2026-07-07': 'available', // Tue
  '2026-08-15': 'available', // Aug
  '2026-09-23': 'reserved',  // Fall
  '2026-12-21': 'available', // Winter (rolls to 2027)
};

describe('bucketAvailability', () => {
  it('day: one bucket per night, available=1/0', () => {
    const b = bucketAvailability(byDate, 'day');
    expect(b).toHaveLength(9);
    expect(b[0]).toMatchObject({ label: '6/29', available: 1, total: 1 });
    expect(b[1]).toMatchObject({ available: 0, total: 1 }); // reserved
  });

  it('week: Monday-start buckets aggregate available nights', () => {
    const b = bucketAvailability(byDate, 'week');
    const weekA = b.find((x) => x.key === '2026-06-29');
    const weekB = b.find((x) => x.key === '2026-07-06');
    expect(weekA).toMatchObject({ total: 4, available: 3 }); // 06-29,06-30,07-01,07-05
    expect(weekB).toMatchObject({ total: 2, available: 1 }); // 07-06,07-07
  });

  it('month: keyed YYYY-MM with month-name labels', () => {
    const b = bucketAvailability(byDate, 'month');
    expect(b.find((x) => x.key === '2026-06')).toMatchObject({ label: 'Jun', total: 2, available: 1 });
    expect(b.find((x) => x.key === '2026-07')).toMatchObject({ label: 'Jul', total: 4, available: 3 });
    expect(b.find((x) => x.key === '2026-08')).toMatchObject({ label: 'Aug', available: 1 });
  });

  it('season: Summer/Fall/Winter, December rolls into the next year', () => {
    const b = bucketAvailability(byDate, 'season');
    expect(b.find((x) => x.key === '2026-Summer')).toMatchObject({ available: 5, total: 7 });
    expect(b.find((x) => x.key === '2026-Fall')).toMatchObject({ available: 0, total: 1 });
    expect(b.find((x) => x.key === '2027-Winter')).toMatchObject({ label: 'Winter', available: 1 });
  });

  it('honors the `from` cutoff', () => {
    const b = bucketAvailability(byDate, 'month', { from: '2026-08-01' });
    expect(b.map((x) => x.key)).toEqual(['2026-08', '2026-09', '2026-12']);
  });
});
