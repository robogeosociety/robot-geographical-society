import { computeRunway } from './runway';

describe('computeRunway — observed availability runway', () => {
  const byDate = {
    '2026-07-01': 'available',
    '2026-07-02': 'available',
    '2026-07-03': 'reserved',
    '2026-07-04': 'available',
    '2026-07-05': 'reserved',
    '2026-07-06': 'reserved',
  };

  it('counts available nights and finds the observed exhaustion (last available night)', () => {
    const r = computeRunway(byDate);
    expect(r.n).toBe(6);
    expect(r.availableNights).toBe(3); // 07-01, 07-02, 07-04
    expect(r.exhaustionDate).toBe('2026-07-04'); // last available night
    expect(r.availableNow).toBe(true); // first night is available
  });

  it('remaining is a non-increasing survival curve (suffix count of available nights)', () => {
    const { remaining } = computeRunway(byDate);
    expect(remaining).toEqual([3, 2, 1, 1, 0, 0]);
    for (let i = 1; i < remaining.length; i++) expect(remaining[i]).toBeLessThanOrEqual(remaining[i - 1]);
  });

  it('honors the `from` cutoff (only nights on/after the selected date count)', () => {
    const r = computeRunway(byDate, { from: '2026-07-03' });
    expect(r.dates[0]).toBe('2026-07-03');
    expect(r.availableNights).toBe(1); // only 07-04 remains available in-window
    expect(r.availableNow).toBe(false); // 07-03 is reserved
  });

  it('handles a fully-booked campsite (no available nights)', () => {
    const r = computeRunway({ '2026-07-01': 'reserved', '2026-07-02': 'other' });
    expect(r.availableNights).toBe(0);
    expect(r.exhaustionDate).toBeNull();
    expect(r.availableNow).toBe(false);
  });

  it('handles an empty calendar', () => {
    const r = computeRunway({});
    expect(r.n).toBe(0);
    expect(r.availableNights).toBe(0);
    expect(r.exhaustionDate).toBeNull();
  });
});
