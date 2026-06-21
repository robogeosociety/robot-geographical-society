import { render, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { useCampgroundPies } from './useCampgroundPies';

// Mount the hook against the mocked map (see setupTests) and capture every
// onProgress(placed, total) tick.
function Harness({ rows, onProgress, batchSize }) {
  const map = useMemo(() => new mapboxgl.Map(), []);
  useCampgroundPies({ map, ready: true, rows, onSelect: () => {}, onEmpty: () => {}, onProgress, batchSize });
  return null;
}

const row = (guid, lat, lng) => ({ guid, name: guid, agency: 'usfs', lat, lng, remaining: 1, remainingTotal: 2 });

describe('useCampgroundPies — progressive placement', () => {
  it('reports progress from 0 up to total, in batches, and ends complete', async () => {
    const ticks = [];
    const rows = [row('a', 47, -121), row('b', 48, -122), row('c', 49, -123)];
    render(<Harness rows={rows} onProgress={(p, t) => ticks.push([p, t])} batchSize={2} />);

    await waitFor(() => expect(ticks.at(-1)).toEqual([3, 3]));
    expect(ticks[0]).toEqual([0, 3]);              // primes the bar with the total up front
    expect(ticks.some(([p]) => p === 2)).toBe(true); // a mid batch landed (batchSize 2)
    expect(Math.max(...ticks.map(([p]) => p))).toBe(3);
  });

  it('skips rows without coordinates when counting the total', async () => {
    const ticks = [];
    const rows = [row('a', 47, -121), { guid: 'b', name: 'b', agency: 'nps' }]; // b has no lat/lng
    render(<Harness rows={rows} onProgress={(p, t) => ticks.push([p, t])} />);

    await waitFor(() => expect(ticks.at(-1)).toEqual([1, 1]));
  });
});
