import React from 'react';

/**
 * FreshnessBanner — the data-staleness pill. Tells the viewer how fresh the
 * captured availability is. Tone shifts amber when the data is getting old.
 */
export function FreshnessBanner({ date, stale = false, label = 'Freshest capture', style = {}, ...rest }) {
  if (!date) return null;
  const color = stale ? 'var(--agency-blm)' : 'var(--mist-400)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '5px 12px',
        borderRadius: 'var(--radius-pill)',
        background: stale ? 'rgba(230,219,116,0.12)' : 'var(--surface-chip)',
        WebkitBackdropFilter: 'var(--glass-filter-chip)',
        backdropFilter: 'var(--glass-filter-chip)',
        border: '1px solid ' + (stale ? 'rgba(230,219,116,0.28)' : 'var(--border-faint)'),
        color,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {label} <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{date}</span>
    </span>
  );
}
