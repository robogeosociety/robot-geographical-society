import { createContext, useContext } from 'react';

// Holds the single persistent Mapbox instance so switching routes swaps layers,
// not the whole map (no re-init flicker). Value: { map, ready }.
export const MapContext = createContext({ map: null, ready: false });

export function useMap() {
  return useContext(MapContext);
}
