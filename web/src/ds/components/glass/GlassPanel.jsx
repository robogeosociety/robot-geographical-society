import React from 'react';

/**
 * GlassPanel — the frosted vibrancy surface everything floats on.
 * The single most important material in the system: blur + saturation, a 1px
 * hairline border, a faint top inner-glow, a soft drop shadow, large radius.
 */
export function GlassPanel({
  variant = 'card',
  as: Tag = 'div',
  className = '',
  style = {},
  children,
  ...rest
}) {
  const base = {
    color: 'var(--text-primary)',
    WebkitBackdropFilter: 'var(--glass-filter)',
    backdropFilter: 'var(--glass-filter)',
    border: '1px solid var(--border-hairline)',
    boxSizing: 'border-box',
  };

  const variants = {
    // Large floating overlay (detail panel, fleet panel).
    panel: {
      background: 'var(--glass-sheen), var(--surface-glass-strong)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--elevation-panel)',
      padding: 'var(--space-5)',
    },
    // Standard frosted card.
    card: {
      background: 'var(--glass-sheen), var(--surface-glass)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--elevation-glass)',
      padding: 'var(--space-4)',
    },
    // A pill-shaped readout chip over terrain (darker, for legibility on bright sky).
    chip: {
      background: 'var(--glass-sheen), var(--surface-chip)',
      WebkitBackdropFilter: 'var(--glass-filter-chip)',
      backdropFilter: 'var(--glass-filter-chip)',
      border: '1px solid var(--border-faint)',
      borderRadius: 'var(--radius-pill)',
      boxShadow: 'var(--shadow-chip)',
      padding: '6px 14px',
    },
  };

  return (
    <Tag className={className} style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </Tag>
  );
}
