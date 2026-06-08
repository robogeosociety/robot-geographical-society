import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampgroundPanel } from './AvailabilityView';

// Ground-truth fixture from the camping vault, verified against live R2
// (sites/2026-06-05/234501.json): Middle Fork (USFS, guid 0c89950f…), Site 24 =
// internal siteId 81835, RESERVED on the Friday night. Aggregate 0 open / 23 reserved
// / 35 total. This is the "how many sites were reserved at Middle Fork" regression.
const GUID = '0c89950f-d0dc-594e-b48d-b1a5293027aa';
const DATE = '2026-06-05';

const CAMPGROUND = {
  guid: GUID, name: 'Middle Fork', agency: 'US Forest Service',
  available: 0, reserved: 23, total: 35, collected_date: DATE, lat: 47.5, lng: -121.5,
};

const SITES = {
  sites: [
    { siteId: '81835', label: '24', loop: 'AREA MIDDLE FORK CAMPGROUND', type: 'STANDARD NONELECTRIC', use: 'Overnight', status: 'reserved' },
    { siteId: '81836', label: '25', loop: 'AREA MIDDLE FORK CAMPGROUND', type: 'STANDARD NONELECTRIC', use: 'Overnight', status: 'available' },
  ],
};

const CALENDAR = { by_date: { '2026-06-04': 'available', '2026-06-05': 'reserved', '2026-06-06': 'available' } };

beforeEach(() => {
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const u = String(url);
    if (u.includes(`/availability/${GUID}/site/81835`)) return jsonOk(CALENDAR);
    if (u.includes(`/availability/${GUID}`)) return jsonOk(SITES);
    return jsonOk({});
  });
});
afterEach(() => vi.restoreAllMocks());

function jsonOk(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('Middle Fork availability — the validated end-to-end case', () => {
  it('shows the aggregate and renders site 24 as reserved', async () => {
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);
    expect(screen.getByText('Middle Fork')).toBeInTheDocument();
    expect(screen.getByText(/0 open/)).toBeInTheDocument();
    expect(screen.getByText(/23 reserved · 35 sites/)).toBeInTheDocument();

    const site24 = await screen.findByRole('button', { name: '24' });
    expect(site24).toHaveClass('site-reserved');
  });

  it('drills into site 24 and the calendar shows 2026-06-05 reserved', async () => {
    const user = userEvent.setup();
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);

    const site24 = await screen.findByRole('button', { name: '24' });
    await user.click(site24);

    await waitFor(() => expect(screen.getByText(/Site 24/)).toBeInTheDocument());
    const cal = screen.getByLabelText(/Site availability calendar/i);
    const cell = within(cal).getByTitle('2026-06-05 · reserved');
    expect(cell).toHaveClass('cal-reserved');
  });

  it('the status filter narrows the site grid to reserved sites', async () => {
    const user = userEvent.setup();
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);
    await screen.findByRole('button', { name: '24' });

    await user.click(screen.getByRole('button', { name: 'reserved' }));
    expect(screen.getByRole('button', { name: '24' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '25' })).not.toBeInTheDocument();
  });
});
