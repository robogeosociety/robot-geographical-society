import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapContext } from '../map/MapContext';
import DemandView from './DemandView';
import { _resetCaches } from '../api';

// Two campgrounds over a few upcoming nights. Riverside is the hot one (mostly
// booked); Lakeshore is mostly open. The night 06-06 is shared so the by-night
// totals sum across both.
const DEMAND = {
  from: '2026-06-05',
  collected: { earliest: '2026-06-04', latest: '2026-06-04' },
  nights: [
    { night: '2026-06-05', available: 2, reserved: 8, total: 10 },
    { night: '2026-06-06', available: 6, reserved: 14, total: 20 },
    { night: '2026-06-07', available: 9, reserved: 1, total: 10 },
  ],
  campgrounds: [
    { guid: 'river', name: 'Riverside', agency: 'US Forest Service', lat: 47, lng: -121, available: 2, reserved: 18, total: 25 },
    { guid: 'lake', name: 'Lakeshore', agency: 'National Park Service', lat: 48, lng: -120, available: 15, reserved: 5, total: 25 },
  ],
};

beforeEach(() => {
  _resetCaches();
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    if (String(url).includes('/demand')) return jsonOk(DEMAND);
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
      <DemandView />
    </MapContext.Provider>,
  );
}

describe('DemandView', () => {
  it('ranks the most in-demand campgrounds, hottest first', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Demand')).toBeInTheDocument());

    const section = screen.getByText('Most in-demand campgrounds').closest('section');
    const names = within(section).getAllByText(/Riverside|Lakeshore/).map((n) => n.textContent);
    // Riverside (18/20 bookable = 90%) outranks Lakeshore (5/20 = 25%).
    expect(names[0]).toBe('Riverside');
    // Its bar shows the ratio rounded to a percent.
    expect(within(section).getByTitle('90%')).toBeInTheDocument();
  });

  it('shows % booked by night and the staleness date', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('% booked by night')).toBeInTheDocument());

    // 06-06 across both campgrounds: 14 reserved / 20 total = 70%.
    const section = screen.getByText('% booked by night').closest('section');
    expect(within(section).getByTitle('70%')).toBeInTheDocument();
    expect(screen.getByText(/Data as of 2026-06-04/)).toBeInTheDocument();
  });

  it('selecting a campground opens its demand popup', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Most in-demand campgrounds')).toBeInTheDocument());

    const section = screen.getByText('Most in-demand campgrounds').closest('section');
    await user.click(within(section).getByText('Riverside'));

    const dialog = screen.getByRole('dialog', { name: /Campground demand/i });
    expect(within(dialog).getByText('90% booked')).toBeInTheDocument();
    expect(within(dialog).getByText('18')).toBeInTheDocument(); // reserved upcoming
  });
});
