// "Data as of <date>" notice — capture can be up to ~2 days behind (the collector
// refreshes one site per wake across the freshness window).
export default function StalenessBanner({ date }) {
  if (!date) return null;
  return (
    <div className="staleness-banner">
      Data as of {date} · up to ~2 days behind
    </div>
  );
}
