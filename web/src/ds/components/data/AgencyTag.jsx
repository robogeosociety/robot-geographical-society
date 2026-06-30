import React from 'react';

const AGENCY = {
  'wa-state-parks': { color: 'var(--agency-wa-parks)', label: 'WA State Parks' },
  'wa-parks':       { color: 'var(--agency-wa-parks)', label: 'WA State Parks' },
  nps:  { color: 'var(--agency-nps)',  label: 'National Park Service' },
  usfs: { color: 'var(--agency-usfs)', label: 'US Forest Service' },
  blm:  { color: 'var(--agency-blm)',  label: 'Bureau of Land Management' },
};

const LONG_TO_SHORT = {
  'WA State Parks': 'wa-state-parks',
  'Washington State Parks': 'wa-state-parks',
  'National Park Service': 'nps',
  'US Forest Service': 'usfs',
  'Bureau of Land Management': 'blm',
};

/** Resolve any agency string (short code or long name) to { color, label }. */
export function agencyMeta(agency) {
  if (!agency) return { color: 'var(--text-muted)', label: '' };
  const key = AGENCY[agency] ? agency : LONG_TO_SHORT[agency];
  return AGENCY[key] || { color: 'var(--text-muted)', label: agency };
}

/**
 * AgencyTag — the managing-agency label, in that agency's semantic hue.
 * Render as the uppercase eyebrow above a campground name, or as a dot+label.
 */
export function AgencyTag({ agency, withDot = false, style = {}, ...rest }) {
  const { color, label } = agencyMeta(agency);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        color,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-2xs)',
        fontWeight: 'var(--weight-semibold)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-label)',
        ...style,
      }}
      {...rest}
    >
      {withDot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 8px 0 ${color}` }} />}
      {label}
    </span>
  );
}
