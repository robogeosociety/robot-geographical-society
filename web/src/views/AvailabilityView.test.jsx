import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampgroundPanel } from './AvailabilityView';
import { _resetCaches } from '../api';

// Ground-truth fixture (camping vault, verified vs live R2, sites/2026-06-05/234501):
// Middle Fork (USFS, guid 0c89950f…), campsite #24 = internal siteId 81835, RESERVED
// the Friday night. The panel now drives the per-location panes (survival + status).
const GUID = '0c89950f-d0dc-594e-b48d-b1a5293027aa';
const DATE = '2026-06-05';

const CAMPGROUND = {
  guid: GUID, name: 'Middle Fork', agency: 'US Forest Service',
  available: 0, reserved: 23, total: 35, collected_date: DATE, lat: 47.5, lng: -121.5,
};

// Roster (one night) + each campsite's full calendar — what getCampgroundSeries stitches.
const ROSTER = {
  sites: [
    { siteId: '81835', label: '24', loop: 'RIVERBEND', type: 'STANDARD NONELECTRIC', use: 'Overnight', status: 'reserved' },
    { siteId: '81836', label: '25', loop: 'RIVERBEND', type: 'STANDARD NONELECTRIC', use: 'Overnight', status: 'available' },
  ],
};
const CAL = {
  81835: { guid: GUID, siteId: '81835', label: '24', loop: 'RIVERBEND', type: 'STANDARD NONELECTRIC', use: 'Overnight',
    by_date: { '2026-06-05': 'reserved', '2026-06-06': 'reserved' } },
  81836: { guid: GUID, siteId: '81836', label: '25', loop: 'RIVERBEND', type: 'STANDARD NONELECTRIC', use: 'Overnight',
    by_date: { '2026-06-05': 'available', '2026-06-06': 'available' } },
};

beforeEach(() => {
  _resetCaches();
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const u = String(url);
    const m = u.match(/\/availability\/[^/]+\/site\/(\d+)/);
    if (m) return jsonOk(CAL[m[1]] ?? { by_date: {} });
    if (u.includes(`/availability/${GUID}`)) return jsonOk(ROSTER);
    return jsonOk({});
  });
});
afterEach(() => vi.restoreAllMocks());

function jsonOk(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

// All views render in the swipe track at once; scope queries to the visible pane.
const activePane = () => within(document.querySelector('.pane[aria-hidden="false"]'));

describe('Middle Fork — per-location panes (the validated case)', () => {
  it('survival view: each campsite shows its availability runway, scarcest first', async () => {
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);
    expect(screen.getByText(/23 reserved · 35 campsites/)).toBeInTheDocument();

    await waitFor(() => expect(activePane().getByText('#24')).toBeInTheDocument());
    // #24 is reserved both captured nights → 0 available nights, "none open".
    const row24 = activePane().getByText('#24').closest('button');
    expect(within(row24).getByText('none open')).toBeInTheDocument();
    // #25 is open both nights → 2 available nights, runs out 06-06.
    const row25 = activePane().getByText('#25').closest('button');
    expect(within(row25).getByText(/runs out 06-06/)).toBeInTheDocument();
    expect(within(row25).getByText('2')).toBeInTheDocument();
  });

  it('availability bars view: bucketed remaining-availability per campsite', async () => {
    const user = userEvent.setup();
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Availability' })).toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: 'Availability' }));
    const pane = activePane();
    // Granularity toggle present; #25 has 2 open nights bucketed.
    expect(pane.getByRole('tab', { name: 'week' })).toBeInTheDocument();
    const row25 = pane.getByText('#25').closest('button');
    expect(within(row25).getByText('2')).toBeInTheDocument();
  });

  it('shows a zoomed loop-cluster layout', async () => {
    const user = userEvent.setup();
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);
    await screen.findByRole('tab', { name: 'Layout' });

    // Layout pane: campsites clustered by loop, each an availability bar.
    await user.click(screen.getByRole('tab', { name: 'Layout' }));
    const pane = activePane();
    expect(pane.getByText(/approximate layout/i)).toBeInTheDocument();
    expect(pane.getByText('RIVERBEND · 2')).toBeInTheDocument(); // loop cluster + campsite count
    expect(pane.getByRole('button', { name: /24/ })).toBeInTheDocument();
  });

  it('status view: the grid colors campsite #24 reserved for the night', async () => {
    const user = userEvent.setup();
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);
    await screen.findByRole('tab', { name: 'Status' });

    await user.click(screen.getByRole('tab', { name: 'Status' }));
    const pane = activePane();
    expect(pane.getByRole('button', { name: '24' })).toHaveClass('site-reserved');
    expect(pane.getByRole('button', { name: '25' })).toHaveClass('site-available');
  });

  it('drills into #24 and the calendar shows 2026-06-05 reserved', async () => {
    const user = userEvent.setup();
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);

    await waitFor(() => expect(activePane().getByText('#24')).toBeInTheDocument());
    await user.click(activePane().getByText('#24').closest('button'));

    await waitFor(() => expect(screen.getByText(/Campsite #24/)).toBeInTheDocument());
    const cal = screen.getByLabelText(/Site availability calendar/i);
    expect(within(cal).getByTitle('2026-06-05 · reserved')).toHaveClass('cal-reserved');
  });

  it('the status filter narrows the panes to reserved campsites', async () => {
    const user = userEvent.setup();
    render(<CampgroundPanel guid={GUID} campground={CAMPGROUND} date={DATE} onClose={() => {}} />);
    await waitFor(() => expect(activePane().getByText('#24')).toBeInTheDocument());

    await user.selectOptions(screen.getByRole('combobox'), 'reserved');
    expect(activePane().getByText('#24')).toBeInTheDocument();
    expect(activePane().queryByText('#25')).not.toBeInTheDocument();
  });
});
