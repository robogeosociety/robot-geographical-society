// A small SVG bar chart of remaining availability per period for one campsite.
// `buckets` = [{ key, label, available, total }]. Each bar's solid height is available
// nights; a faint backing bar shows the period's total captured nights (context).
export default function AvailabilityBars({ buckets, width = 168, height = 38 }) {
  if (!buckets || buckets.length === 0) {
    return <svg className="bars" width={width} height={height} role="img" aria-label="no availability" />;
  }
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const maxTotal = Math.max(1, ...buckets.map((b) => b.total));
  const n = buckets.length;
  const bw = w / n;

  return (
    <svg className="bars" width={width} height={height} role="img"
      aria-label={`remaining availability across ${n} periods`}>
      {buckets.map((b, i) => {
        const x = pad + i * bw;
        const fullH = (b.total / maxTotal) * h;
        const availH = (b.available / maxTotal) * h;
        const bar = Math.max(1, bw - 1);
        return (
          <g key={b.key}>
            <rect x={x + 0.5} y={pad + h - fullH} width={bar} height={fullH} fill="rgba(255,255,255,0.06)" />
            <rect x={x + 0.5} y={pad + h - availH} width={bar} height={availH} fill="#A6E22E">
              <title>{`${b.label}: ${b.available}/${b.total} open`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}
