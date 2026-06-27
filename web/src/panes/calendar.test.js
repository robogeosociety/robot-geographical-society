import { availFraction, nightsToValues, aggregateSeries, monthGrid, WEEKDAYS } from './calendar';

describe('calendar derivations', () => {
  it('availFraction = available / total, guarding divide-by-zero', () => {
    expect(availFraction({ available: 3, total: 4 })).toBeCloseTo(0.75);
    expect(availFraction({ available: 0, total: 0 })).toBe(0);
    expect(availFraction()).toBe(0);
  });

  it('nightsToValues keys a rollup by night', () => {
    const v = nightsToValues([
      { night: '2026-07-04', available: 10, reserved: 30, total: 40 },
      { night: '2026-07-05', available: 5, reserved: 35, total: 40 },
    ]);
    expect(v['2026-07-04']).toEqual({ available: 10, reserved: 30, total: 40 });
    expect(Object.keys(v)).toHaveLength(2);
  });

  it('aggregateSeries rolls per-site statuses into per-night counts', () => {
    const series = [
      { by_date: { '2026-07-04': 'available', '2026-07-05': 'reserved' } },
      { by_date: { '2026-07-04': 'reserved', '2026-07-05': 'other' } },
    ];
    const agg = aggregateSeries(series);
    expect(agg['2026-07-04']).toEqual({ available: 1, reserved: 1, total: 2 });
    expect(agg['2026-07-05']).toEqual({ available: 0, reserved: 1, total: 2 });
  });

  it('monthGrid builds weekday-aligned full months', () => {
    // July 2026: the 1st is a Wednesday → 3 leading blanks (Sun,Mon,Tue).
    const months = monthGrid({ '2026-07-04': { available: 1, total: 1 } });
    expect(months).toHaveLength(1);
    const july = months[0];
    expect(july.label).toBe('Jul 2026');
    expect(july.weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(july.weeks[0][3].day).toBe(1); // Wednesday column
    // The captured day carries its value; an uncaptured day is value: undefined.
    const jul4 = july.weeks.flat().find((c) => c && c.date === '2026-07-04');
    expect(jul4.value).toEqual({ available: 1, total: 1 });
    const jul1 = july.weeks.flat().find((c) => c && c.date === '2026-07-01');
    expect(jul1.value).toBeUndefined();
    // Every row is exactly a 7-day week.
    expect(july.weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('monthGrid spans multiple months in order', () => {
    const months = monthGrid({ '2026-07-31': {}, '2026-08-01': {} });
    expect(months.map((m) => m.key)).toEqual(['2026-07', '2026-08']);
  });

  it('monthGrid of nothing is empty', () => {
    expect(monthGrid({})).toEqual([]);
  });

  it('exposes a 7-column weekday header', () => {
    expect(WEEKDAYS).toHaveLength(7);
  });
});
