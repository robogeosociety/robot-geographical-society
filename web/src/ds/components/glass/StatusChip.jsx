import React from 'react';

/**
 * StatusChip — a floating HUD readout pill over the terrain. Optional leading
 * dot (status color) or inline glyph, with mono numerics for any figures.
 * This is the "142 campgrounds · fill = remaining availability" chip.
 */
export function StatusChip({ dot, tone, className = '', style = {}, children, ...rest }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        background: 'var(--surface-chip)',
        WebkitBackdropFilter: 'var(--glass-filter-chip)',
        backdropFilter: 'var(--glass-filter-chip)',
        border: '1px solid var(--border-faint)',
        borderRadius: 'var(--radius-pill)',
        boxShadow: 'var(--shadow-chip)',
        padding: '6px 14px',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {(dot || tone) && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            background: tone || dot,
            boxShadow: `0 0 8px 0 ${tone || dot}`,
          }}
        />
      )}
      {children}
    </span>
  );
}
