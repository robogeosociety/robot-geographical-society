import '@testing-library/jest-dom';

// This vitest jsdom env ships without Web Storage, so provide a tiny in-memory
// localStorage (data keys are own-enumerable; the Storage methods live on the
// prototype, so Object.keys(localStorage) returns just the keys, as in a browser).
// The persistent api.js cache relies on it; real browsers have it natively.
if (typeof window.localStorage === 'undefined') {
  const storage = Object.create({
    getItem(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; },
    setItem(k, v) { this[k] = String(v); },
    removeItem(k) { delete this[k]; },
    clear() { for (const k of Object.keys(this)) delete this[k]; },
  });
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}

// Mock mapbox-gl for tests (it requires a browser canvas)
vi.mock('mapbox-gl', () => {
  const makeMap = () => {
    const handlers = [];
    return {
      __handlers: handlers,
      on: vi.fn((...args) => handlers.push(args)),
      off: vi.fn(),
      remove: vi.fn(),
      addControl: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getSource: vi.fn(() => ({ setData: vi.fn() })),
      getLayer: vi.fn(() => undefined),
      removeLayer: vi.fn(),
      removeSource: vi.fn(),
      setFilter: vi.fn(),
      setFeatureState: vi.fn(),
      queryRenderedFeatures: vi.fn(() => []),
      getCanvas: vi.fn(() => ({ style: {} })),
      getZoom: vi.fn(() => 7),
      flyTo: vi.fn(),
      isStyleLoaded: vi.fn(() => true),
      loaded: vi.fn(() => true),
    };
  };

  const Map = vi.fn(() => makeMap());
  const Marker = vi.fn(() => {
    const m = { setLngLat: () => m, addTo: () => m, remove: () => {} };
    return m;
  });
  return {
    default: { Map, Marker, NavigationControl: vi.fn(), accessToken: null },
    Map,
    Marker,
    NavigationControl: vi.fn(),
  };
});

// Suppress mapbox-gl CSS import warnings
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
