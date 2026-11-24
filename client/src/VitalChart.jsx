import React, { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const fmtYear = (t) => new Date(t).getFullYear();

export default function VitalChart({ chart, data }) {
  const [table, setTable] = useState(false);
  const multi = chart.series.length > 1;
  const latest = data[data.length - 1];
  const headline = chart.series
    .map((s) => latest[s.key])
    .filter((v) => v !== undefined)
    .join("/");

  return (
    <section className="card chart">
      <div className="chart-head">
        <div>
          <h3>{chart.title}</h3>
          <p className="muted small">
            Latest <strong className="hero">{headline}</strong> {chart.unit} · {fmtDate(latest.t)}
          </p>
        </div>
        <button className="link" onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? "Chart" : "Table"}
        </button>
      </div>

      {table ? (
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
        <div className="plot" role="img" aria-label={`${chart.title} over time, ${data.length} readings`}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={fmtYear}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                stroke="var(--grid)"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                stroke="none"
                width={48}
              />
              <Tooltip
                labelFormatter={fmtDate}
                formatter={(v, name) => [`${v} ${chart.unit}`, name]}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--grid)", borderRadius: 8 }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-secondary)" }}
              />
              {multi && <Legend iconType="plainline" wrapperStyle={{ color: "var(--text-secondary)", fontSize: 12 }} />}
              {chart.series.map((s, i) => (
                <Line
                  key={s.key}
                  name={s.label}
                  dataKey={s.key}
                  type="monotone"
                  stroke={`var(--series-${i + 1})`}
                  strokeWidth={2}
                  strokeDasharray={i === 1 ? "6 3" : undefined}
                  dot={data.length < 25 ? { r: 3, strokeWidth: 2, stroke: "var(--surface)" } : false}
                  activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
