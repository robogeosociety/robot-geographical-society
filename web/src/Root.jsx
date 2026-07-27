import { useLocation } from 'react-router-dom';
import App from './App.jsx';
import CodexApp from './codex/CodexApp.jsx';

/**
 * Top-level shell switch.
 *
 * `/codex/*` is the encyclopedia — a scrolling document with no map. Every
 * other path is the map cockpit, whose one persistent Mapbox instance lives in
 * `App`. The split is a plain pathname test rather than nested `<Routes>` so
 * that App keeps its own absolute route table untouched, and so that a codex
 * URL never constructs a map (or demands a Mapbox token) at all.
 */
export default function Root() {
  const { pathname } = useLocation();
  return pathname === '/codex' || pathname.startsWith('/codex/') ? <CodexApp /> : <App />;
}
