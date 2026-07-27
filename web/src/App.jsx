import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { MapContext } from './map/MapContext';
import TopBar from './components/TopBar.jsx';
import {
  MAP_STYLE, MAP_LIGHT_PRESET, MAP_PITCH, TERRAIN_EXAGGERATION, WA_BOUNDS,
} from './constants';
import AvailabilityView from './views/AvailabilityView';
import DemandView from './views/DemandView';
import CalendarView from './views/CalendarView';
import WatchView from './views/WatchView';
import CollectorsView from './views/CollectorsView';

// The cockpit telemetry strip etched along the bottom edge — live camera readout
// (the Oblivion/bubbleship cue), rendered as our own HUD. Updates on map move.
function TelemetryStrip({ map }) {
  const [cam, setCam] = useState(null);
  useEffect(() => {
    if (!map) return undefined;
    const read = () => {
      const c = map.getCenter?.();
      if (!c) return;
      setCam({ lat: c.lat, lng: c.lng, pitch: map.getPitch?.() ?? 0, bearing: map.getBearing?.() ?? 0 });
    };
    read();
    map.on('move', read);
    return () => { map.off('move', read); };
  }, [map]);
  if (!cam) return null;
  const ns = cam.lat >= 0 ? 'N' : 'S';
  const ew = cam.lng >= 0 ? 'E' : 'W';
  const cells = [
    `${Math.abs(cam.lat).toFixed(3)}°${ns} ${Math.abs(cam.lng).toFixed(3)}°${ew}`,
    `PITCH ${Math.round(cam.pitch)}°`,
    `BEARING ${(Math.round(cam.bearing) + 360) % 360}°`,
    'LIGHT DUSK',
    'FLEET ◴ NOMINAL',
  ];
  return (
    <div className="telemetry-strip" aria-hidden="true">
      {cells.map((c, i) => <span key={i}>{c}</span>)}
    </div>
  );
}

// The app is served at two gated subdomains; each lands on its own view (the nav tabs
// still cross-navigate). collectors.* → /collectors, everything else → /availability.
function defaultPath() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return host.startsWith('collectors.') ? '/collectors' : '/availability';
}

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
        fitBoundsOptions: { padding: 40, pitch: MAP_PITCH },
        pitch: MAP_PITCH,
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
    instance.on('load', () => {
      loaded = true; setMapError(null); setReady(true);
      // Dress the live map as the dusk valley: golden-hour light + 3D terrain.
      // Wrapped — a URL-restricted token or style hiccup shouldn't blank the UI.
      try {
        instance.setConfigProperty?.('basemap', 'lightPreset', MAP_LIGHT_PRESET);
        if (!instance.getSource('mapbox-dem')) {
          instance.addSource('mapbox-dem', {
            type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512, maxzoom: 14,
          });
          instance.setTerrain({ source: 'mapbox-dem', exaggeration: TERRAIN_EXAGGERATION });
        }
      } catch (e) {
        console.warn('Valley map config skipped:', e?.message || e);
      }
    });
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
        <TopBar />

        <div className="map-wrapper">
          {mapError && (
            <div className="map-error" role="alert">
              <strong>Map Error:</strong> {mapError}
            </div>
          )}
          <div ref={containerRef} className="map-container" />

          {/* The valley dressing — drifting golden haze, edge vignette, and the
              cockpit telemetry strip. All pointer-events:none, below the overlays. */}
          <div className="valley-haze" aria-hidden="true" />
          <div className="valley-vignette" aria-hidden="true" />
          <TelemetryStrip map={map} />

          <Routes>
            <Route path="/" element={<Navigate to={defaultPath()} replace />} />
            <Route path="/availability" element={<AvailabilityView />} />
            <Route path="/demand" element={<DemandView />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/watch" element={<WatchView />} />
            <Route path="/collectors" element={<CollectorsView />} />
            <Route path="*" element={<Navigate to={defaultPath()} replace />} />
          </Routes>
        </div>
      </div>
    </MapContext.Provider>
  );
}
