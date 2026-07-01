import React from 'react';

/**
 * GlassSelect — a frosted dropdown for scope pickers (campground, campsite,
 * night). A label sits above a native <select> styled as glass; the native
 * menu inherits a dark color-scheme.
 */
export function GlassSelect({ label, value, onChange, options = [], disabled = false, style = {} }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...style }}>
      {label && (
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-2xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>
          {label}
        </span>
      )}
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-chip)',
          WebkitBackdropFilter: 'var(--glass-filter-chip)',
          backdropFilter: 'var(--glass-filter-chip)',
          border: '1px solid var(--border-faint)',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            padding: '7px 28px 7px 11px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            colorScheme: 'dark',
            outline: 'none',
          }}
        >
          {options.map((o) => {
            const val = typeof o === 'string' ? o : o.value;
            const lbl = typeof o === 'string' ? o : o.label;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)', fontSize: 10 }}>▾</span>
      </div>
    </label>
  );
}
