import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapContext } from '../map/MapContext';
import CalendarView from './CalendarView';
import { _resetCaches } from '../api';

const DEMAND = {
  from: '2026-07-01',
  collected: { earliest: '2026-06-30', latest: '2026-06-30' },
  nights: [
    { night: '2026-07-03', available: 30, reserved: 10, total: 40 }, // 75% open
    { night: '2026-07-04', available: 4, reserved: 36, total: 40 },  // 10% open (hot)
  ],
  campgrounds: [
    { guid: 'colonial', name: 'Colonial Creek', agency: 'National Park Service', lat: 48, lng: -121, available: 34, reserved: 46, total: 80 },
  ],
};

const SITES = { sites: [{ siteId: '811', label: '24', loop: 'Riverbend', type: 'tent', use: 'overnight' }] };
const SITE_CAL = { by_date: { '2026-07-03': 'available', '2026-07-04': 'reserved' } };

beforeEach(() => {
  _resetCaches();
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const u = String(url);
    if (u.includes('/demand')) return jsonOk(DEMAND);
    if (u.match(/\/availability\/colonial\/site\/811/)) return jsonOk(SITE_CAL);
    if (u.match(/\/availability\/colonial/)) return jsonOk(SITES);
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
      <CalendarView />
    </MapContext.Provider>,
  );
}

describe('CalendarView', () => {
  it('renders the cross-campground bar-fill calendar by default', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Calendar')).toBeInTheDocument());
    // July 4 (10% open) cell carries its open share in the title.
    expect(screen.getByTitle(/2026-07-04 · 4\/40 open · 10%/)).toBeInTheDocument();
    expect(screen.getByTitle(/2026-07-03 · 30\/40 open · 75%/)).toBeInTheDocument();
    // The fill legend (not the red/green status legend) is shown.
    expect(screen.getByText(/bar height = share of sites open/)).toBeInTheDocument();
  });

  it('drilling into a single campsite switches to a red/green status calendar', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Calendar')).toBeInTheDocument());

    // Pick the campground, then the campsite.
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'colonial');
    const selects = screen.getAllByRole('combobox');
    await waitFor(() => expect(within(selects[1]).getByText(/#24/)).toBeInTheDocument());
    await user.selectOptions(selects[1], '811');

    // Status mode: per-night available/reserved titles, and the status legend appears.
    await waitFor(() => expect(screen.getByTitle('2026-07-04 · reserved')).toBeInTheDocument());
    expect(screen.getByTitle('2026-07-03 · available')).toBeInTheDocument();
  });
});
