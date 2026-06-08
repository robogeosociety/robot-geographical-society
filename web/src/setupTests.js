import '@testing-library/jest-dom';

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
  return {
    default: { Map, NavigationControl: vi.fn(), accessToken: null },
    Map,
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
