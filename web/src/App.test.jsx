import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';

// Fake Mapbox token so the map initializes; mapbox-gl itself is mocked (setupTests).
beforeEach(() => {
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN = 'pk.test_token';
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const u = String(url);
    if (u.includes('/collect/dlq')) return jsonOk({ count: 0, sites: [] });
    if (u.includes('/collectors')) return jsonOk([]);
    if (u.includes('/availability')) return jsonOk([]);
    return jsonOk({});
  });
});

afterEach(() => vi.restoreAllMocks());

function jsonOk(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App shell', () => {
  it('renders the top nav with both view tabs', () => {
    renderAt('/availability');
    expect(screen.getByRole('link', { name: /Availability/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Collectors/i })).toBeInTheDocument();
  });

  it('renders the persistent map container', () => {
    renderAt('/availability');
    expect(document.querySelector('.map-container')).not.toBeNull();
  });

  it('redirects "/" to the availability view', async () => {
    renderAt('/');
    await waitFor(() => expect(document.querySelector('.map-overlay-tl')).not.toBeNull());
  });

  it('availability view shows the map controls and agency legend', async () => {
    renderAt('/availability');
    await waitFor(() => expect(document.querySelector('.map-overlay-tl')).not.toBeNull());
    expect(screen.getByText(/WA State Parks/i)).toBeInTheDocument();
  });

  it('collectors view shows the fleet health panel', async () => {
    renderAt('/collectors');
    await waitFor(() => expect(screen.getByText(/Fleet health/i)).toBeInTheDocument());
  });
});
