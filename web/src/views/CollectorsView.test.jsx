import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapContext } from '../map/MapContext';
import CollectorsView from './CollectorsView';

const COLLECTORS = [
  { guid: 'a', name: 'Alpha', agency: 'usfs', lat: 47, lng: -121, collect: true, state: 'healthy' },
  { guid: 'b', name: 'Bravo', agency: 'nps', lat: 47, lng: -121, collect: true, state: 'healthy' },
  { guid: 'c', name: 'Charlie', agency: 'rec', lat: 47, lng: -121, collect: true, state: 'quarantined' },
  { guid: 'd', name: 'Delta', agency: 'blm', lat: 47, lng: -121, collect: false, state: 'disabled' },
];
const DLQ = {
  count: 1,
  sites: [{ id: '247585', name: "Heart O' the Hills", agency: 'nps', kind: 'rec', failures: 5, sinceISO: '2026-06-03T18:22:49Z', lastError: 'HTTP 404' }],
};

let reactivateCalls;
let me; // /me response — set per test

beforeEach(() => {
  reactivateCalls = [];
  me = { email: 't@x', role: 'admin', isAdmin: true };
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const u = String(url);
    if (u.endsWith('/me')) return jsonOk(me);
    if (u.includes('/collect/reactivate')) { reactivateCalls.push(u); return jsonOk({ status: 'reactivated' }); }
    if (u.includes('/collect/dlq')) return jsonOk(DLQ);
    if (u.includes('/collectors')) return jsonOk(COLLECTORS);
    return jsonOk({});
  });
});
afterEach(() => vi.restoreAllMocks());

function jsonOk(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

// Render without a live map (ready=false) — useCircleLayer no-ops, the panel still loads.
function renderView() {
  return render(
    <MapContext.Provider value={{ map: null, ready: false }}>
      <CollectorsView />
    </MapContext.Provider>,
  );
}

describe('CollectorsView fleet panel', () => {
  it('summarizes fleet state counts', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Fleet health')).toBeInTheDocument());
    const grid = within(document.querySelector('.stat-grid'));
    const stat = (label) => grid.getByText(label).previousSibling.textContent;
    expect(stat('Total')).toBe('4');
    expect(stat('Healthy')).toBe('2');
    expect(stat('Quarantined')).toBe('1');
    expect(stat('Disabled')).toBe('1');
  });

  it('admin: shows the role badge, lists quarantined collectors, reactivates by id', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText("Heart O' the Hills")).toBeInTheDocument());
    expect(screen.getByText('admin')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Reactivate/i }));
    await waitFor(() => expect(reactivateCalls.length).toBe(1));
    expect(reactivateCalls[0]).toMatch(/\/collect\/reactivate\?id=247585$/);
  });

  it('viewer: no reactivate button, shows the admin-only note + viewer badge', async () => {
    me = { email: 'rando@x', role: 'viewer', isAdmin: false };
    renderView();
    await waitFor(() => expect(screen.getByText("Heart O' the Hills")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('viewer')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /Reactivate/i })).not.toBeInTheDocument();
    expect(screen.getByText(/reactivate is admin-only/i)).toBeInTheDocument();
  });
});
