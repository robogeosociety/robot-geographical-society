import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import campsiteData from '../../data/campsites.json';

const AGENCY_COLORS = {
  'wa-state-parks': '#A6E22E',
  nps: '#FD971F',
  usfs: '#66D9EF',
  blm: '#E6DB74',
};

const AGENCY_LABELS = {
  'wa-state-parks': 'WA State Parks',
  nps: 'National Park Service',
  usfs: 'US Forest Service',
  blm: 'Bureau of Land Management',
};

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const SOURCE_ID = 'campsites';
const CIRCLES_LAYER = 'campsite-circles';

export default function App() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const hoveredIdRef = useRef(null);

  const [selectedCampsite, setSelectedCampsite] = useState(null);
  const [activeAgencies, setActiveAgencies] = useState(
    Object.keys(AGENCY_COLORS)
  );
  const [mapError, setMapError] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Build Mapbox filter expression for active agencies
  const buildFilter = useCallback((agencies) => {
    if (agencies.length === 0) return ['==', ['get', 'agency_short'], ''];
    if (agencies.length === Object.keys(AGENCY_COLORS).length) return null;
    return ['in', ['get', 'agency_short'], ['literal', agencies]];
  }, []);

  // Initialize map
  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setMapError(
        'No Mapbox token found. Set VITE_MAPBOX_ACCESS_TOKEN in your .env file.'
      );
      return;
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [-120.5, 47.5],
      zoom: 6,
      failIfMajorPerformanceCaveat: false,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('error', (e) => {
      console.error('Mapbox error:', e);
      const msg = e?.error?.message || e?.message || String(e);
      setMapError(`Map failed to load: ${msg}`);
    });

    map.on('load', () => {
      // Add campsite GeoJSON source
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: campsiteData,
        generateId: true,
      });

      // Base circle layer
      map.addLayer({
        id: CIRCLES_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 5,
            10, 9,
          ],
          'circle-color': [
            'match',
            ['get', 'agency_short'],
            'wa-state-parks', AGENCY_COLORS['wa-state-parks'],
            'nps', AGENCY_COLORS.nps,
            'usfs', AGENCY_COLORS.usfs,
            'blm', AGENCY_COLORS.blm,
            '#CCCCCC',
          ],
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            3,
            1,
          ],
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            1,
            0.85,
          ],
        },
      });

      setMapLoaded(true);
    });

    // Hover interaction
    map.on('mousemove', CIRCLES_LAYER, (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const id = e.features[0]?.id;
      if (id === undefined) return;
      if (hoveredIdRef.current !== null && hoveredIdRef.current !== id) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false }
        );
      }
      hoveredIdRef.current = id;
      map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
    });

    map.on('mouseleave', CIRCLES_LAYER, () => {
      map.getCanvas().style.cursor = '';
      if (hoveredIdRef.current !== null) {
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false }
        );
        hoveredIdRef.current = null;
      }
    });

    // Click to select campsite
    map.on('click', CIRCLES_LAYER, (e) => {
      const props = e.features[0]?.properties;
      if (!props) return;
      // Parse types array (stored as JSON string in GeoJSON properties)
      const types =
        typeof props.types === 'string' ? JSON.parse(props.types) : props.types;
      setSelectedCampsite({ ...props, types });
    });

    // Click on blank map area to deselect
    map.on('click', (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [CIRCLES_LAYER],
      });
      if (features.length === 0) setSelectedCampsite(null);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Apply agency filters when activeAgencies or map load state changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const filter = buildFilter(activeAgencies);
    map.setFilter(CIRCLES_LAYER, filter);
  }, [activeAgencies, mapLoaded, buildFilter]);

  const toggleAgency = (agency) => {
    setActiveAgencies((prev) =>
      prev.includes(agency)
        ? prev.filter((a) => a !== agency)
        : [...prev, agency]
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Robot Geographical Society</h1>
        <p className="app-subtitle">Washington State Campsite Explorer</p>
      </header>

      <div className="controls">
        {Object.entries(AGENCY_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`agency-toggle ${activeAgencies.includes(key) ? 'active' : 'inactive'}`}
            style={
              activeAgencies.includes(key)
                ? { borderColor: AGENCY_COLORS[key], color: AGENCY_COLORS[key] }
                : {}
            }
            onClick={() => toggleAgency(key)}
            aria-pressed={activeAgencies.includes(key)}
          >
            <span
              className="agency-dot"
              style={
                activeAgencies.includes(key)
                  ? { backgroundColor: AGENCY_COLORS[key] }
                  : {}
              }
            />
            {label}
          </button>
        ))}
      </div>

      <div className="map-wrapper">
        {mapError && (
          <div className="map-error" role="alert">
            <strong>Map Error:</strong> {mapError}
          </div>
        )}
        <div ref={mapContainerRef} className="map-container" />
      </div>

      {selectedCampsite && (
        <div className="detail-panel" role="dialog" aria-label="Campsite details">
          <button
            className="panel-close"
            onClick={() => setSelectedCampsite(null)}
            aria-label="Close panel"
          >
            ✕
          </button>

          <div className="panel-agency" style={{ color: AGENCY_COLORS[selectedCampsite.agency_short] }}>
            {AGENCY_LABELS[selectedCampsite.agency_short] || selectedCampsite.agency}
          </div>

          <h2 className="panel-name">{selectedCampsite.name}</h2>

          <div className="panel-meta">
            <span className="panel-sites">
              <strong>{selectedCampsite.sites}</strong> sites
            </span>
            {selectedCampsite.year_round ? (
              <span className="panel-badge year-round">Year-round</span>
            ) : selectedCampsite.open_month ? (
              <span className="panel-badge seasonal">
                Opens {MONTH_NAMES[selectedCampsite.open_month]}
              </span>
            ) : null}
            {selectedCampsite.reservable ? (
              <span className="panel-badge reservable">Reservable</span>
            ) : (
              <span className="panel-badge first-come">First-come</span>
            )}
          </div>

          <div className="panel-types">
            {selectedCampsite.types.map((t) => (
              <span key={t} className="type-badge">
                {t}
              </span>
            ))}
          </div>

          {selectedCampsite.notes && (
            <p className="panel-notes">{selectedCampsite.notes}</p>
          )}

          <div className="panel-actions">
            <a
              href={selectedCampsite.reservation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-reserve"
            >
              Reserve / Info →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
