import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { MapContext } from './map/MapContext';
import { MAP_STYLE, WA_BOUNDS } from './constants';
import AvailabilityView from './views/AvailabilityView';
import CollectorsView from './views/CollectorsView';

// One Mapbox instance for the whole app. The container div is always mounted; the
// routed views add/remove their own layers on top of it (see useCircleLayer), so
// switching tabs swaps pins instead of re-initializing the map.
export default function App() {
  const containerRef = useRef(null);
  const [map, setMap] = useState(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setMapError('No Mapbox token. Set VITE_MAPBOX_ACCESS_TOKEN in web/.env.local.');
      return undefined;
    }
    mapboxgl.accessToken = token;

    let instance;
    try {
      instance = new mapboxgl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        bounds: WA_BOUNDS,
        fitBoundsOptions: { padding: 40 },
        failIfMajorPerformanceCaveat: false,
      });
    } catch (e) {
      setMapError(`Map failed to load: ${e.message}`);
      return undefined;
    }

    instance.addControl(new mapboxgl.NavigationControl(), 'top-right');
    // Only surface a fatal banner for failures *before* the map loads. Once it's up,
    // transient resource errors (e.g. a tile 403 from a URL-restricted token) are
    // recoverable and shouldn't blank the UI — log them instead.
    let loaded = false;
    instance.on('error', (e) => {
      const msg = e?.error?.message || e?.message || JSON.stringify(e?.error || e);
      if (loaded) { console.error('Mapbox error:', msg); return; }
      setMapError(`Map failed to load: ${msg}`);
    });
    instance.on('load', () => { loaded = true; setMapError(null); setReady(true); });
    setMap(instance);

    return () => {
      instance.remove();
      setMap(null);
      setReady(false);
    };
  }, []);

  return (
    <MapContext.Provider value={{ map, ready }}>
      <div className="app">
        <header className="topbar">
          <div className="brand">Robot Geographical Society</div>
          <nav className="nav-tabs">
            <NavLink to="/availability" className="nav-tab">Availability</NavLink>
            <NavLink to="/collectors" className="nav-tab">Collectors</NavLink>
          </nav>
        </header>

        <div className="map-wrapper">
          {mapError && (
            <div className="map-error" role="alert">
              <strong>Map Error:</strong> {mapError}
            </div>
          )}
          <div ref={containerRef} className="map-container" />

          <Routes>
            <Route path="/" element={<Navigate to="/availability" replace />} />
            <Route path="/availability" element={<AvailabilityView />} />
            <Route path="/collectors" element={<CollectorsView />} />
            <Route path="*" element={<Navigate to="/availability" replace />} />
          </Routes>
        </div>
      </div>
    </MapContext.Provider>
  );
}
