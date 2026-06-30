import React from 'react';

/** Availability ramp: fraction open (1 = wide open) → ramp color. */
export function availabilityColor(t) {
  if (t >= 0.6) return 'var(--avail-high)';
  if (t >= 0.25) return 'var(--avail-mid)';
  if (t > 0) return 'var(--avail-low)';
  return 'var(--avail-none)';
}

/**
 * AvailabilityPill — the "N open" summary pill, filled by the availability-ramp
 * color for the open fraction. Dark text on the bright fill.
 */
export function AvailabilityPill({ open = 0, total = 0, label, style = {}, ...rest }) {
  const ratio = total > 0 ? open / total : 0;
  return (
    <span
      style={{
        display: 'inline-block',
        whiteSpace: 'nowrap',
        padding: '3px 11px',
        borderRadius: 'var(--radius-pill)',
        background: availabilityColor(ratio),
        color: 'var(--text-on-accent)',
        fontFamily: 'var(--font-mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-semibold)',
        ...style,
      }}
      {...rest}
    >
      {label || `${open} open`}
    </span>
  );
}
