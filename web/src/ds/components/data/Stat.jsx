import React from 'react';

/**
 * Stat — a single big numeric readout with a micro label beneath. Numerals are
 * tabular mono; the label is uppercase spaced caps. The fleet-stats grid is a
 * row of these.
 */
export function Stat({ value, label, color, size = 'md', align = 'center', style = {} }) {
  const sizes = { sm: 'var(--text-lg)', md: 'var(--text-display)', lg: '44px' };
  return (
    <div style={{ textAlign: align, ...style }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 'var(--weight-semibold)',
          letterSpacing: 'var(--tracking-tight)',
          fontSize: sizes[size],
          lineHeight: 'var(--leading-tight)',
          color: color || 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-2xs)',
          fontWeight: 'var(--weight-semibold)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-label)',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
    </div>
  );
}
