import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import IndexView from './IndexView.jsx';
import CampgroundView from './CampgroundView.jsx';
import SiteView from './SiteView.jsx';
import ReferenceView from './ReferenceView.jsx';
import './codex.css';

/**
 * The codex shell.
 *
 * Deliberately NOT mounted inside the map shell: every other view in this app
 * is an overlay on one persistent Mapbox instance, and an encyclopedia is a
 * reading surface, not a panel. Splitting at the root means a codex URL never
 * instantiates a map, never needs a Mapbox token, and gets an ordinary
 * scrolling document instead of the app's fixed, overflow-hidden viewport.
 */
export default function CodexApp() {
  const { pathname, hash } = useLocation();
  const scrollRef = useRef(null);

  // A fresh article starts at the top; an in-article anchor jumps to it.
  //
  // The anchor cannot simply be resolved on navigation. An article's body
  // arrives from a fetch, so the heading a deep link points at does not exist
  // when the route changes — and once it does, the page is still settling
  // (web fonts land, the site roster fills in), which walks the target out from
  // under a scroll that has already happened.
  //
  // So: hunt for the element each frame, then keep re-aligning until its
  // position holds still for two consecutive frames. That makes
  // `/codex/adams-fork#hazards` land correctly whether the article is cached,
  // in flight, or still reflowing. Both scroll calls are optional — jsdom
  // implements neither.
  useEffect(() => {
    if (!hash) {
      scrollRef.current?.scrollTo?.(0, 0);
      return undefined;
    }
    const id = decodeURIComponent(hash.slice(1));
    const findBy = Date.now() + 3000;   // give the fetch this long to land
    const HOLD_MS = 700;                // then hold the aim this long
    let holdUntil = null;
    let frame;
    let cancelled = false;

    // `instant` on purpose: `.codex-scroll` sets `scroll-behavior: smooth` for
    // the reader's own anchor clicks, but re-aiming at a still-animating smooth
    // scroll reads its eased-in first frames as "already settled".
    const aim = (el) => el?.scrollIntoView?.({ behavior: 'instant', block: 'start' });

    const tick = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (el) {
        aim(el);
        if (holdUntil === null) holdUntil = Date.now() + HOLD_MS;
        if (Date.now() > holdUntil) return;
      } else if (Date.now() > findBy) {
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();

    // Web fonts land after first paint and re-flow the column under the anchor;
    // one more aim once they are in catches the case that outlives HOLD_MS.
    document.fonts?.ready?.then(() => { if (!cancelled) aim(document.getElementById(id)); });

    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [pathname, hash]);

  return (
    <div className="app codex-app">
      <TopBar />
      <main className="codex-scroll" ref={scrollRef}>
        <div className="codex-page">
          <Routes>
            <Route path="/codex" element={<IndexView />} />
            {/* Static segment, so it outranks `/codex/:slug` — no campground
                slug may be "reference" (none is). */}
            <Route path="/codex/reference/:slug" element={<ReferenceView />} />
            <Route path="/codex/:slug" element={<CampgroundView />} />
            <Route path="/codex/:slug/site/:site" element={<SiteView />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
