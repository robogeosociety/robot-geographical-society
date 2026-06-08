import { useEffect, useRef } from 'react';

// Adds one GeoJSON circle layer to the shared map for the lifetime of a view, and
// removes it on unmount so switching routes leaves a clean map. `features` is a
// GeoJSON FeatureCollection; `paint` a Mapbox circle-paint object; `onSelect` is
// called with a clicked feature's `properties`. Hover thickens the stroke.
export function useCircleLayer({ map, ready, id, features, paint, onSelect, onEmptyClick }) {
  const sourceId = `${id}-src`;
  const layerId = `${id}-circles`;
  const hoveredRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onEmptyRef = useRef(onEmptyClick);
  onSelectRef.current = onSelect;
  onEmptyRef.current = onEmptyClick;

  // Create the source + layer + interactions once (per view mount).
  useEffect(() => {
    if (!map || !ready) return undefined;

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: 'geojson', data: emptyFC(), generateId: true });
    }
    if (!map.getLayer(layerId)) {
      map.addLayer({ id: layerId, type: 'circle', source: sourceId, paint });
    }

    const onMove = (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const fid = e.features[0]?.id;
      if (fid === undefined) return;
      if (hoveredRef.current !== null && hoveredRef.current !== fid) {
        map.setFeatureState({ source: sourceId, id: hoveredRef.current }, { hover: false });
      }
      hoveredRef.current = fid;
      map.setFeatureState({ source: sourceId, id: fid }, { hover: true });
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      if (hoveredRef.current !== null) {
        map.setFeatureState({ source: sourceId, id: hoveredRef.current }, { hover: false });
        hoveredRef.current = null;
      }
    };
    const onClick = (e) => {
      const props = e.features[0]?.properties;
      if (props && onSelectRef.current) onSelectRef.current(props);
    };
    const onMapClick = (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (hit.length === 0 && onEmptyRef.current) onEmptyRef.current();
    };

    map.on('mousemove', layerId, onMove);
    map.on('mouseleave', layerId, onLeave);
    map.on('click', layerId, onClick);
    map.on('click', onMapClick);

    return () => {
      map.off('mousemove', layerId, onMove);
      map.off('mouseleave', layerId, onLeave);
      map.off('click', layerId, onClick);
      map.off('click', onMapClick);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      hoveredRef.current = null;
    };
    // paint is fixed per view; intentionally not a dep (we update data, not paint).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, sourceId, layerId]);

  // Push new data whenever features change (date recolor, fleet refresh).
  useEffect(() => {
    if (!map || !ready) return;
    const src = map.getSource(sourceId);
    if (src) src.setData(features || emptyFC());
  }, [map, ready, sourceId, features]);
}

export function emptyFC() {
  return { type: 'FeatureCollection', features: [] };
}

// Build a FeatureCollection from API rows that carry lat/lng. Extra props pass through.
export function rowsToFC(rows, extra = () => ({})) {
  return {
    type: 'FeatureCollection',
    features: (rows || [])
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
        properties: { ...r, ...extra(r) },
      })),
  };
}

// Shared hover stroke/opacity paint fragments (spread into a view's paint object).
export const HOVER_PAINT = {
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 10, 9],
  'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, 1],
  'circle-stroke-color': '#FFFFFF',
  'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.85],
};
