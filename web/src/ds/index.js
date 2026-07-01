// Robot Geographical Society design system — "a peek into a secret mountain valley".
// Vendored from the Claude Design handoff. Glass HUD components that read the CSS
// custom properties defined in ./styles.css (import that once at the app root).
//
// Components are pure presentation (React + inline styles + var(--*) tokens); the
// exported helper maps (agencyMeta / availabilityColor / demandColor / stateMeta)
// mirror the semantics already in web/src/constants.js.

export { GlassPanel } from './components/glass/GlassPanel.jsx';
export { GlassButton } from './components/glass/GlassButton.jsx';
export { StatusChip } from './components/glass/StatusChip.jsx';
export { NavTabs } from './components/glass/NavTabs.jsx';
export { FreshnessBanner } from './components/glass/FreshnessBanner.jsx';

export { AgencyTag, agencyMeta } from './components/data/AgencyTag.jsx';
export { AvailabilityPill, availabilityColor } from './components/data/AvailabilityPill.jsx';
export { StateBadge, stateMeta } from './components/data/StateBadge.jsx';
export { Stat } from './components/data/Stat.jsx';
export { RankBar, demandColor } from './components/data/RankBar.jsx';
export { Legend } from './components/data/Legend.jsx';

export { Beacon } from './components/map/Beacon.jsx';

export { FilterChip } from './components/forms/FilterChip.jsx';
export { GlassSelect } from './components/forms/GlassSelect.jsx';

export { FillCalendar } from './components/calendar/FillCalendar.jsx';
export { FillCurve } from './components/calendar/FillCurve.jsx';
