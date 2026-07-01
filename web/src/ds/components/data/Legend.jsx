import React from 'react';

/**
 * Legend — the frosted key that floats bottom-left (agency colors, demand ramp,
 * collector states). Each item is a glowing dot + label.
 */
export function Legend({ items = [], style = {}, ...rest }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        gap: 'var(--space-4)',
        padding: '8px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-chip)',
        WebkitBackdropFilter: 'var(--glass-filter-chip)',
        backdropFilter: 'var(--glass-filter-chip)',
        border: '1px solid var(--border-faint)',
        boxShadow: 'var(--shadow-chip)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        ...style,
      }}
      {...rest}
    >
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: it.color, boxShadow: `0 0 8px 0 ${it.color}` }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
