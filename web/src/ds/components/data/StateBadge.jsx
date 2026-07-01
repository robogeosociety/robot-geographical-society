import React from 'react';

const STATE = {
  healthy:     { color: 'var(--state-healthy)',     label: 'Healthy' },
  overdue:     { color: 'var(--state-overdue)',     label: 'Overdue / failing' },
  quarantined: { color: 'var(--state-quarantined)', label: 'Quarantined' },
  disabled:    { color: 'var(--state-disabled)',    label: 'Disabled' },
};

/** Resolve a collector fleet state to { color, label }. */
export function stateMeta(state) {
  return STATE[state] || { color: 'var(--text-muted)', label: state || '—' };
}

/**
 * StateBadge — a solid status badge (collector health, demand %, watch fill).
 * Filled with a semantic color and dark text. Use `color` directly, or pass a
 * collector `state` to look one up.
 */
export function StateBadge({ state, color, children, style = {}, ...rest }) {
  const resolved = color || stateMeta(state).color;
  const text = children != null ? children : stateMeta(state).label;
  return (
    <span
      style={{
        display: 'inline-block',
        whiteSpace: 'nowrap',
        padding: '3px 11px',
        borderRadius: 'var(--radius-pill)',
        background: resolved,
        color: 'var(--text-on-accent)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-semibold)',
        ...style,
      }}
      {...rest}
    >
      {text}
    </span>
  );
}
