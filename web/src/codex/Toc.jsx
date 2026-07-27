import { useSyncExternalStore } from 'react';

const NARROW = '(max-width: 1100px)';

/**
 * True while the viewport is stacked (one column) rather than three.
 * Every matchMedia touch is optional: the shared test setup stubs it, and a
 * restored stub hands back undefined — a collapsed-by-default ToC is a fine
 * answer when we cannot tell.
 */
function useNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia?.(NARROW);
      mq?.addEventListener?.('change', onChange);
      return () => mq?.removeEventListener?.('change', onChange);
    },
    () => window.matchMedia?.(NARROW)?.matches ?? false,
    () => false,
  );
}

/**
 * The article's table of contents.
 *
 * Built from the heading nodes the parser already emitted, so it can never
 * drift from the prose. On a desktop column it sticks open alongside the
 * article; stacked, it starts CLOSED — an open list there costs most of a phone
 * screen before the reader reaches the first paragraph.
 */
export function Toc({ items = [], extra = [] }) {
  const narrow = useNarrow();
  const entries = [...items.filter((h) => h.depth >= 2 && h.depth <= 3), ...extra];
  if (entries.length < 2) return <div className="codex-toc-spacer" />;

  return (
    <nav className="codex-toc" aria-label="Contents">
      <details open={!narrow} className="codex-toc-details">
        <summary className="rgs-label">Contents</summary>
        <ol className="codex-toc-list">
          {entries.map((h) => (
            <li key={h.id} data-depth={h.depth}>
              <a href={`#${h.id}`}>{h.text}</a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
