import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bandsOverlap, niceAxis, yearTicks } from "./fhirData.js";
import { fmtDate } from "./Tiles.jsx";

const YEAR_MS = 365 * 24 * 3600 * 1000;

function rangeText(normal) {
  const [lo, hi] = normal;
  if (lo !== null && hi !== null && lo !== 0) return `${lo}–${hi}`;
  if (hi !== null && (lo === null || lo === 0)) return `≤${hi}`;
  return `≥${lo}`;
}

function ChartTooltip({ active, payload, label, chart }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-date">{fmtDate(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="tooltip-row">
          <span className="swatch" style={{ background: p.color }} />
          <span className="tooltip-label">{p.name}</span>
          <strong>{p.value}</strong> <span className="muted">{chart.unit}</span>
        </div>
      ))}
    </div>
  );
}

export default function VitalChart({ chart, data, totalReadings }) {
  const [table, setTable] = useState(false);
  const multi = chart.series.length > 1;
  const banded = chart.series.filter((s) => s.normal);

  const { domain, ticks } = useMemo(() => {
    const values = chart.series.flatMap((s) => data.map((r) => r[s.key]).filter((v) => v !== undefined));
    return niceAxis(values, banded.flatMap((s) => s.normal));
  }, [chart, data, banded]);

  const overlap = useMemo(() => bandsOverlap(chart.series, domain), [chart, domain]);
  const compact = typeof window !== "undefined" && window.innerWidth < 600;
  const spanYears = data.length > 1 ? (data[data.length - 1].t - data[0].t) / YEAR_MS : 0;
  const fmtTick = (t) =>
    spanYears < 2
      ? new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" })
      : String(new Date(t).getFullYear());
  const subtitle =
    data.length === 0
      ? `${totalReadings} readings in total`
      : `${data.length} reading${data.length === 1 ? "" : "s"} · ${fmtDate(data[0].t)} – ${fmtDate(data[data.length - 1].t)}`;

  return (
    <section className={`card chart${chart.id === "bp" ? " wide" : ""}`}>
      <div className="chart-head">
        <div>
          <h3>{chart.title}</h3>
          <p className="muted small">{subtitle}</p>
        </div>
        <button className="link" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {data.length === 0 ? (
        <p className="empty">No readings in this period. Try a longer range.</p>
      ) : table ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {chart.series.map((s) => (
                  <th key={s.key}>{s.label} ({chart.unit})</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((r) => (
                <tr key={r.t}>
                  <td>{fmtDate(r.t)}</td>
                  {chart.series.map((s) => (
                    <td key={s.key}>{r[s.key] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="plot" role="img" aria-label={`${chart.title} over time, ${data.length} readings`}>
            <ResponsiveContainer width="100%" height={chart.id === "bp" ? 300 : 230}>
              <LineChart data={data} margin={{ top: 18, right: 18, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                {chart.series.map((s, i) => {
                  if (!s.normal) return null;
                  const color = `var(--series-${i + 1})`;
                  if (overlap) {
                    // Overlapping fills turn muddy, so mark each limit with a dashed line instead.
                    return s.normal
                      .filter((e) => e !== null && e !== 0)
                      .map((e) => (
                        <ReferenceLine
                          key={`${s.key}-${e}`}
                          y={e}
                          stroke={color}
                          strokeOpacity={0.55}
                          strokeDasharray="2 4"
                          ifOverflow="hidden"
                        />
                      ));
                  }
                  return (
                    <ReferenceArea
                      key={s.key}
                      y1={s.normal[0] ?? domain[0]}
                      y2={s.normal[1] ?? domain[1]}
                      fill={color}
                      fillOpacity={0.09}
                      stroke="none"
                      ifOverflow="hidden"
                    />
                  );
                })}
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  ticks={spanYears >= 2 ? yearTicks(data[0].t, data[data.length - 1].t, compact ? 5 : 9) : undefined}
                  tickFormatter={fmtTick}
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  stroke="var(--grid)"
                  padding={{ left: 8, right: 8 }}
                />
                <YAxis
                  domain={domain}
                  ticks={ticks}
                  allowDataOverflow
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  stroke="none"
                  width={48}
                />
                <Tooltip
                  content={<ChartTooltip chart={chart} />}
                  cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
                />
                {chart.series.map((s, i) => (
                  <Line
                    key={s.key}
                    name={s.label}
                    dataKey={s.key}
                    type="monotone"
                    stroke={`var(--series-${i + 1})`}
                    strokeWidth={2}
                    strokeDasharray={i === 1 ? "6 3" : undefined}
                    dot={
                      data.length < 25
                        ? { r: 3, fill: `var(--series-${i + 1})`, stroke: "var(--surface)", strokeWidth: 2 }
                        : false
                    }
                    activeDot={{ r: 5, fill: `var(--series-${i + 1})`, stroke: "var(--surface)", strokeWidth: 2 }}
                    label={({ x, y, value, index }) =>
                      index === data.length - 1 && value !== undefined ? (
                        <text key={`${s.key}-end`} x={x} y={y - 10} textAnchor="end" className="end-label">
                          {value}
                        </text>
                      ) : null
                    }
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-foot">
            {multi && (
              <ul className="legend">
                {chart.series.map((s, i) => (
                  <li key={s.key}>
                    <svg width="22" height="8" aria-hidden="true">
                      <line
                        x1="0" y1="4" x2="22" y2="4"
                        stroke={`var(--series-${i + 1})`}
                        strokeWidth="2"
                        strokeDasharray={i === 1 ? "6 3" : undefined}
                      />
                    </svg>
                    {s.label}
                  </li>
                ))}
              </ul>
            )}
            {banded.length > 0 && (
              <p className="muted small">
                {overlap ? "Dashed lines: typical limits" : "Shaded: typical range"},{" "}
                {banded.map((s) => `${multi ? s.label + " " : ""}${rangeText(s.normal)}`).join(", ")}{" "}
                {chart.unit}.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
