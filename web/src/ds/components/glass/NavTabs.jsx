import React from 'react';

/**
 * NavTabs — the slim glass nav in the top bar. Frosted pill track with an
 * active tab that lifts to a brighter frosted fill. Cross-fades, never hard cuts.
 */
export function NavTabs({ tabs = [], active, onChange }) {
  return (
    <nav
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        borderRadius: 'var(--radius-pill)',
        background: 'var(--surface-chip)',
        WebkitBackdropFilter: 'var(--glass-filter-chip)',
        backdropFilter: 'var(--glass-filter-chip)',
        border: '1px solid var(--border-faint)',
        boxShadow: 'var(--shadow-chip)',
      }}
    >
      {tabs.map((t) => {
        const key = typeof t === 'string' ? t : t.id;
        const label = typeof t === 'string' ? t : t.label;
        const isActive = key === active;
        return (
          <Tab key={key} active={isActive} onClick={() => onChange && onChange(key)}>
            {label}
          </Tab>
        );
      })}
    </nav>
  );
}

function Tab({ active, onClick, children }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none',
        border: '1px solid ' + (active ? 'var(--border-hairline)' : 'transparent'),
        background: active ? 'var(--surface-glass-strong)' : 'transparent',
        color: active ? 'var(--text-primary)' : (hover ? 'var(--text-secondary)' : 'var(--text-muted)'),
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        padding: '5px 14px',
        borderRadius: 'var(--radius-pill)',
        cursor: 'pointer',
        transition: 'color var(--dur-fast) var(--ease-soft)',
        boxShadow: active ? 'inset 0 1px 0 var(--glass-highlight)' : 'none',
      }}
    >
      {children}
    </button>
  );
}
