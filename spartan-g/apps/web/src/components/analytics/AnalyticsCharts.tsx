const palette = ['#b91c1c', '#0f766e', '#d97706', '#4f46e5', '#64748b'];

export interface AnalyticsChartRow { label: string; value: number; detail?: string }

export function AnalyticsDonut({ title, rows }: { title: string; rows: AnalyticsChartRow[] }) {
  const visible = rows.filter(row => Number.isFinite(row.value) && row.value > 0);
  const total = visible.reduce((sum, row) => sum + row.value, 0);
  if (!total) return <p className="text-sm text-gray-500">No {title.toLowerCase()} data is available yet.</p>;

  let offset = 0;
  const slices = visible.map((row, index) => {
    const start = offset / total * 100;
    offset += row.value;
    return `${palette[index % palette.length]} ${start}% ${offset / total * 100}%`;
  }).join(', ');

  return <figure className="flex flex-wrap items-center gap-5" aria-label={title}>
    <div aria-hidden="true" className="h-36 w-36 shrink-0 rounded-full p-7" style={{ background: `conic-gradient(${slices})` }}>
      <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-center text-sm font-semibold text-gray-700">{total.toLocaleString()}<br />total</div>
    </div>
    <ul className="min-w-[12rem] flex-1 space-y-2 text-sm" aria-label={`${title} values`}>
      {visible.map((row, index) => <li key={row.label} className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-gray-600"><span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />{row.label}</span>
        <span className="shrink-0 text-right font-semibold tabular-nums text-gray-800">{row.value.toLocaleString()} · {Math.round(row.value / total * 100)}%{row.detail ? <span className="block text-xs font-normal text-gray-500">{row.detail}</span> : null}</span>
      </li>)}
    </ul>
  </figure>;
}

export function AnalyticsLineChart({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const safeRows = rows.filter(row => Number.isFinite(row.value) && row.value >= 0);
  if (!safeRows.length || safeRows.every(row => row.value === 0))
    return <p className="text-sm text-gray-500">No {title.toLowerCase()} recorded in this period.</p>;

  const width = 600, height = 210, left = 28, right = 572, top = 16, bottom = 166;
  const max = Math.max(1, ...safeRows.map(row => row.value));
  const points = safeRows.map((row, index) => {
    const x = safeRows.length === 1 ? (left + right) / 2 : left + index * (right - left) / (safeRows.length - 1);
    const y = bottom - row.value / max * (bottom - top);
    return { ...row, x, y };
  });
  const labelStride = Math.max(1, Math.ceil(points.length / 10));
  const annotateValues = points.length <= 12;
  return <figure aria-label={title}>
    <svg className="h-44 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${safeRows.map(row => `${row.label}, ${row.value}`).join('; ')}`}>
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#cbd5e1" strokeWidth="1" />
      <line x1={left} y1={top} x2={left} y2={bottom} stroke="#cbd5e1" strokeWidth="1" />
      <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#b91c1c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(point => <circle key={point.label} cx={point.x} cy={point.y} r="4" fill="#b91c1c" />)}
      {points.map((point, index) => annotateValues || index % labelStride === 0 || index === points.length - 1
        ? <text key={point.label + '-value'} x={point.x} y={Math.max(top + 12, point.y - 9)} textAnchor="middle" fontSize="12" fill="#334155">{point.value}</text> : null)}
      {points.map((point, index) => index % labelStride === 0 || index === points.length - 1
        ? <text key={point.label + '-label'} x={point.x} y={bottom + 23} textAnchor="middle" fontSize="11" fill="#64748b">{point.label}</text> : null)}
    </svg>
    <figcaption className="sr-only">{safeRows.map(row => `${row.label}: ${row.value}`).join(', ')}</figcaption>
  </figure>;
}

export function AnalyticsBars({ title, rows }: { title: string; rows: AnalyticsChartRow[] }) {
  const safeRows = rows.filter(row => Number.isFinite(row.value) && row.value >= 0);
  if (!safeRows.length || safeRows.every(row => row.value === 0))
    return <p className="text-sm text-gray-500">No {title.toLowerCase()} data is available yet.</p>;
  const max = Math.max(1, ...safeRows.map(row => row.value));
  return <div role="list" aria-label={title} className="max-h-80 space-y-3 overflow-y-auto pr-1">
    {safeRows.map(row => <div role="listitem" key={row.label}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-gray-700" title={row.label}>{row.label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-gray-900">{row.value.toLocaleString()}{row.detail ? <span className="ml-1 text-xs font-normal text-gray-500">{row.detail}</span> : null}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${row.label}: ${row.value}`}>
        <div className="h-full rounded-full bg-red-700" style={{ width: `${row.value / max * 100}%` }} />
      </div>
    </div>)}
  </div>;
}
