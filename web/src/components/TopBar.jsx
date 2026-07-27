import { NavLink } from 'react-router-dom';
import logoUrl from '../ds/assets/logo.svg';

/**
 * The masthead + view tabs, shared by the map shell and the codex shell so the
 * two halves of the app cannot drift apart. The codex is a reading surface with
 * no Mapbox instance behind it, but it is the same product and keeps the same
 * nav.
 */
export default function TopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src={logoUrl} alt="" aria-hidden="true" />
        Robot Geographical Society
      </div>
      <nav className="nav-tabs">
        <NavLink to="/availability" className="nav-tab">Availability</NavLink>
        <NavLink to="/demand" className="nav-tab">Demand</NavLink>
        <NavLink to="/calendar" className="nav-tab">Calendar</NavLink>
        <NavLink to="/watch" className="nav-tab">Watch</NavLink>
        <NavLink to="/collectors" className="nav-tab">Collectors</NavLink>
        <NavLink to="/codex" className="nav-tab">Codex</NavLink>
      </nav>
    </header>
  );
}
