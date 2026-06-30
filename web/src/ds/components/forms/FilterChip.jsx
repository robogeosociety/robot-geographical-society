import React from 'react';

/**
 * FilterChip — a toggleable pill (agency filters, site-status filters, calendar
 * granularity). On = accent-tinted glass with a bright hairline; off = quiet
 * frosted outline. Optional leading dot (agency color).
 */
export function FilterChip({ active = false, dot, accent = 'var(--accent)', onClick, children, style = {} }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '5px 12px',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        textTransform: 'capitalize',
        border: '1px solid ' + (active ? accent : 'var(--border-faint)'),
        background: active ? 'color-mix(in srgb, ' + accent + ' 14%, transparent)' : 'var(--surface-chip)',
        WebkitBackdropFilter: 'var(--glass-filter-chip)',
        backdropFilter: 'var(--glass-filter-chip)',
        color: active ? 'var(--text-primary)' : (hover ? 'var(--text-secondary)' : 'var(--text-muted)'),
        opacity: !active && !hover ? 0.85 : 1,
        transition: 'var(--transition-hover)',
        ...style,
      }}
    >
      {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, boxShadow: active ? `0 0 8px 0 ${dot}` : 'none' }} />}
      {children}
    </button>
  );
}
