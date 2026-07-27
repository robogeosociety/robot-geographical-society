import { useSyncExternalStore } from 'react';

const NARROW = '(max-width: 1100px)';

/**
 * The entries a table of contents would show: H2/H3 headings, plus whatever the
 * page appends (a campground's "Sites (N)"). Fewer than two is not a contents
 * list, so it returns none.
 *
 * Exported because the *page* has to know whether a ToC is worth a column
 * before it lays out the grid — a note with one heading or none (the `Travel
 * times` table, which is a lede and a 100-row table) should not leave a 210px
 * gutter standing empty.
 */
export function tocEntries(items = [], extra = []) {
  const entries = [...items.filter((h) => h.depth >= 2 && h.depth <= 3), ...extra];
  return entries.length < 2 ? [] : entries;
}

/**
 * True while the viewport is stacked (one column) rather than columned.
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
 * drift from the prose. On a wide screen it sticks open alongside the article;
 * stacked, it starts CLOSED — an open list there costs most of a phone screen
 * before the reader reaches the first paragraph.
 */
export function Toc({ entries }) {
  const narrow = useNarrow();
  if (!entries?.length) return null;

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
