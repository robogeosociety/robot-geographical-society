import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapContext } from '../map/MapContext';
import WatchView from './WatchView';
import { _resetCaches } from '../api';

// Two watched nights. Colonial Creek is sold out (100% booked); Middle Fork is filling
// (60%). The list rows carry the latest-point summary; the detail fetch returns the
// full curve.
const WATCHES = {
  watches: [
    {
      guid: 'cc', name: 'Colonial Creek North', agency: 'National Park Service',
      lat: 48, lng: -121, target_date: '2026-07-04', updated_at: '2026-06-21T11:00:00.000Z',
      done: true, sold_out: true, observations: 1, available: 0, reserved: 5, total: 5, fill: 1,
    },
    {
      guid: 'mf', name: 'Middle Fork', agency: 'US Forest Service',
      lat: 47, lng: -121, target_date: '2026-07-04', updated_at: '2026-06-21T10:00:00.000Z',
      done: false, sold_out: false, observations: 2, available: 4, reserved: 6, total: 10, fill: 0.6,
    },
  ],
};

const MF_CURVE = {
  guid: 'mf', name: 'Middle Fork', agency: 'US Forest Service', target_date: '2026-07-04',
  started_at: '2026-06-20T10:00:00.000Z', updated_at: '2026-06-21T10:00:00.000Z',
  done: false, sold_out: false,
  points: [
    { ts: '2026-06-20T10:00:00.000Z', available: 8, reserved: 2, total: 10 },
    { ts: '2026-06-21T10:00:00.000Z', available: 4, reserved: 6, total: 10 },
  ],
};

beforeEach(() => {
  _resetCaches();
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const u = String(url);
    if (u.includes('/watch/mf/')) return jsonOk(MF_CURVE);
    if (u.includes('/watch')) return jsonOk(WATCHES);
    return jsonOk({});
  });
});
afterEach(() => vi.restoreAllMocks());

function jsonOk(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

function renderView() {
  return render(
    <MapContext.Provider value={{ map: null, ready: false }}>
      <WatchView />
    </MapContext.Provider>,
  );
}

describe('WatchView', () => {
  it('ranks watched nights hottest first and shows the sold-out marker', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Watch')).toBeInTheDocument());

    const names = screen.getAllByText(/Colonial Creek North|Middle Fork/).map((n) => n.textContent);
    expect(names[0]).toBe('Colonial Creek North'); // sold out → top
    expect(screen.getByText('SOLD OUT')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument(); // Middle Fork's current fill
  });

  it('opens a watch detail with the full fill-curve on click', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Watch')).toBeInTheDocument());

    await user.click(screen.getByText('Middle Fork'));

    const dialog = await screen.findByRole('dialog', { name: /Hot-date watch/i });
    // The detail fetched the 2-point curve.
    await waitFor(() => expect(within(dialog).getByText('2')).toBeInTheDocument()); // observations
    expect(within(dialog).getByText('60% booked')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is watched', async () => {
    global.fetch.mockImplementation(() => jsonOk({ watches: [] }));
    renderView();
    await waitFor(() => expect(screen.getByText(/No dates are being watched yet/)).toBeInTheDocument());
  });
});
