import React from 'react';

/**
 * GlassButton — actions on glass. `primary` is a bright accent fill (reserve,
 * confirm); `secondary` is frosted glass; `ghost` is a quiet text affordance.
 * Hover lifts opacity; press settles it down a hair.
 */
export function GlassButton({
  variant = 'secondary',
  size = 'md',
  accent = 'var(--accent)',
  disabled = false,
  className = '',
  style = {},
  children,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);

  const sizes = {
    sm: { padding: '5px 12px', fontSize: 'var(--text-xs)' },
    md: { padding: '8px 16px', fontSize: 'var(--text-sm)' },
    lg: { padding: '11px 22px', fontSize: 'var(--text-md)' },
  };

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-semibold)',
    borderRadius: 'var(--radius-pill)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'var(--transition-hover), transform var(--dur-fast) var(--ease-soft)',
    transform: press && !disabled ? 'scale(0.97)' : 'scale(1)',
    border: '1px solid transparent',
    whiteSpace: 'nowrap',
    ...sizes[size],
  };

  const variants = {
    primary: {
      background: accent,
      color: 'var(--text-on-accent)',
      filter: hover && !disabled ? 'brightness(1.08)' : 'none',
      boxShadow: `0 0 18px -4px ${accent}`,
    },
    secondary: {
      background: hover && !disabled ? 'var(--surface-glass-strong)' : 'var(--surface-glass)',
      WebkitBackdropFilter: 'var(--glass-filter-chip)',
      backdropFilter: 'var(--glass-filter-chip)',
      borderColor: 'var(--border-hairline)',
      color: 'var(--text-primary)',
    },
    ghost: {
      background: 'transparent',
      color: hover && !disabled ? 'var(--text-primary)' : 'var(--text-muted)',
    },
    danger: {
      background: 'transparent',
      borderColor: 'var(--danger)',
      color: 'var(--danger)',
    },
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={className}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      {...rest}
    >
      {children}
    </button>
  );
}
