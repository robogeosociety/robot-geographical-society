import React from 'react';

/**
 * Beacon — a campground on the map: a glowing pac-man availability pie seated in
 * the terrain (reprising the product's original draining-gauge disc, now luminous).
 * A light base disc reads as the clickable point; the agency-colored wedge is the
 * remaining availability (drains clockwise from 12 o'clock as it books up); the
 * booked remainder is the same color at low opacity; an agency-color ring outlines
 * it. The whole mark glows in the agency (or state/demand) color.
 */
export function Beacon({
  color = 'var(--agency-usfs)',
  fill = 1,
  size = 18,
  selected = false,
  pulse = false,
  faded = false,
  title,
  onClick,
  style = {},
}) {
  const px = typeof size === 'number' ? size : (parseFloat(size) || 18);
  const f = Math.max(0, Math.min(1, typeof fill === 'number' ? fill : (parseFloat(fill) || 0)));
  const r = (px - 3) / 2;
  const c = px / 2;

  const polar = (deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const slice = (start, end) => {
    const [x0, y0] = polar(start);
    const [x1, y1] = polar(end);
    const large = end - start > 180 ? 1 : 0;
    return `M${c},${c} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
  };

  const glow = selected ? `0 0 26px 6px ${color}` : `0 0 14px 3px ${color}`;

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-label={title}
      style={{
        position: 'relative',
        width: px,
        height: px,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        lineHeight: 0,
        opacity: faded ? 0.4 : 1,
        animation: pulse ? 'rgs-beacon-pulse 3.2s var(--ease-soft) infinite' : 'none',
        ...style,
      }}
    >
      {/* seated ground glow */}
      <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', boxShadow: glow }} />
      {/* glowing pac-man pie */}
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        style={{ position: 'absolute', inset: 0, filter: `drop-shadow(0 0 ${selected ? 7 : 4}px ${color})` }}
      >
        <circle cx={c} cy={c} r={r} fill={color} fillOpacity="0.06" />
        {f >= 1
          ? <circle cx={c} cy={c} r={r} fill={color} />
          : f > 0
            ? <path d={slice((1 - f) * 360, 360)} fill={color} />
            : null}
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      {selected && (
        <span style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: `1px solid ${color}`, opacity: 0.5 }} />
      )}
    </button>
  );
}
