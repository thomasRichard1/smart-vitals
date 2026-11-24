import React from "react";
import { chartStatus, latestValues } from "./fhirData.js";

export const fmtDate = (t) =>
  new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const fmtMonth = (t) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short" });

// Status is always icon + label, never color alone.
const STATUS = {
  in: { icon: "✓", label: "In range", cls: "good" },
  high: { icon: "▲", label: "Above range", cls: "warn" },
  low: { icon: "▼", label: "Below range", cls: "warn" },
};

export function StatusChip({ status }) {
  if (!status) return null;
  const s = STATUS[status];
  return (
    <span className={`chip status ${s.cls}`}>
      <span aria-hidden="true" className="status-icon">{s.icon}</span>
      {s.label}
    </span>
  );
}

/** Tiny trend line: 2px stroke, no axes, end dot. */
function Sparkline({ data, dataKey }) {
  const pts = data.filter((r) => r[dataKey] !== undefined);
  if (pts.length < 2) return null;
  if (pts.every((p) => p[dataKey] === pts[0][dataKey])) return null; // a flat line says nothing
  const W = 120;
  const H = 36;
  const pad = 4;
  const ts = pts.map((p) => p.t);
  const vs = pts.map((p) => p[dataKey]);
  const [t0, t1] = [Math.min(...ts), Math.max(...ts)];
  const [v0, v1] = [Math.min(...vs), Math.max(...vs)];
  const x = (t) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - pad * 2);
  const y = (v) => (v1 === v0 ? H / 2 : H - pad - ((v - v0) / (v1 - v0)) * (H - pad * 2));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[dataKey]).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.t)} cy={y(last[dataKey])} r="3.5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

function deltaText(first) {
  if (!first || first.delta === null) return null;
  if (first.delta === 0) return `No change since ${fmtMonth(first.prevT)}`;
  const arrow = first.delta > 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(first.delta)} since ${fmtMonth(first.prevT)}`;
}

export function SummaryTile({ chart, data }) {
  const values = latestValues(data, chart);
  if (values.length === 0) return null;
  const status = chartStatus(values);
  const first = values[0];
  const delta = deltaText(first);
  const asFraction = chart.id === "bp" && values.length === 2;

  return (
    <article className="tile">
      <div className="tile-top">
        <h3>{chart.title}</h3>
        <StatusChip status={status} />
      </div>
      <p className="tile-value">
        {asFraction ? (
          <span className="pair">{values.map((v) => v.value).join("/")}</span>
        ) : (
          values.map((v) => (
            <span key={v.key} className="pair">
              {values.length > 1 && <small>{v.label}</small>} {v.value}
            </span>
          ))
        )}
        <span className="unit">{chart.unit}</span>
      </p>
      <div className="tile-foot">
        <span className="muted small">{delta ?? `Only reading · ${fmtDate(first.t)}`}</span>
        <Sparkline data={data} dataKey={first.key} />
      </div>
    </article>
  );
}
