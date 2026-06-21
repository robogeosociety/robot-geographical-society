// A slim loading bar for map data. Determinate when `value` (0..1) is given — it fills
// as points stream onto the map; pass `indeterminate` while the total is still unknown
// (the network fetch is in flight, before any point has been placed). Replaces the old
// static "loading…" text.
export default function ProgressBar({ value = 0, indeterminate = false, label = 'Loading' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
    >
      <div
        className={`progress-fill${indeterminate ? ' progress-fill--indeterminate' : ''}`}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
