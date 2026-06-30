import React from 'react';

/** Demand/fill ramp: 0 (cold/open) → 1 (hot/booked). */
export function demandColor(t) {
  if (t >= 0.66) return 'var(--avail-none)';
  if (t >= 0.33) return 'var(--avail-mid)';
  return 'var(--avail-high)';
}

/**
 * RankBar — one row of a ranking panel: a name on the left, a horizontal
 * percentage bar + numeric label on the right. Used for "most in-demand
 * campgrounds" and "hottest upcoming nights". Clickable when `onClick` is set.
 */
export function RankBar({ name, ratio = 0, label, color, onClick, title, style = {} }) {
  const fill = color || demandColor(ratio);
  const pct = `${Math.round(ratio * 100)}%`;
  const interactive = !!onClick;
  const [hover, setHover] = React.useState(false);

  return (
    <button
      type="button"
      title={title ?? label ?? pct}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={!interactive}
      style={{
        display: 'grid',
        gridTemplateColumns: '42% 1fr',
        alignItems: 'center',
        gap: 'var(--space-3)',
        width: '100%',
        padding: '4px 0',
        background: 'none',
        border: 'none',
        textAlign: 'left',
        cursor: interactive ? 'pointer' : 'default',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: hover && interactive ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'var(--transition-hover)',
        }}
      >
        {name}
      </span>
      <span style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ height: 8, borderRadius: 4, background: 'var(--glass-fill)', border: '1px solid var(--border-faint)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: pct, borderRadius: 4, background: fill, boxShadow: `0 0 8px -2px ${fill}` }} />
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {label || pct}
        </span>
      </span>
    </button>
  );
}
