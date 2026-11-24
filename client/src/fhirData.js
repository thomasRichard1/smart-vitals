// Pure helpers: turn FHIR Observation resources into chartable series, and derive the
// numbers the UI shows (status vs a reference range, change since last reading, axis
// domains, time filtering). No React or network code, so it is easy to unit test.

const LB_TO_KG = 0.45359237;

// `normal` is a general adult reference range [low, high] used only to shade the chart and
// flag the latest reading. Illustrative, not medical advice. Use null for an open end.
export const CHARTS = [
  {
    id: "bp",
    title: "Blood pressure",
    unit: "mmHg",
    series: [
      { key: "systolic", label: "Systolic", codes: ["8480-6"], normal: [90, 120] },
      { key: "diastolic", label: "Diastolic", codes: ["8462-4"], normal: [60, 80] },
    ],
  },
  { id: "weight", title: "Body weight", unit: "kg", series: [{ key: "weight", label: "Weight", codes: ["29463-7"] }] },
  {
    id: "bmi",
    title: "Body mass index",
    unit: "kg/m²",
    series: [{ key: "bmi", label: "BMI", codes: ["39156-5"], normal: [18.5, 25] }],
  },
  {
    id: "cholesterol",
    title: "Cholesterol",
    unit: "mg/dL",
    series: [
      { key: "ldl", label: "LDL", codes: ["18262-6", "13457-7", "2089-1"], normal: [0, 100] },
      { key: "hdl", label: "HDL", codes: ["2085-9"], normal: [40, null] },
    ],
  },
  {
    id: "hr",
    title: "Heart rate",
    unit: "beats/min",
    series: [{ key: "hr", label: "Heart rate", codes: ["8867-4"], normal: [60, 100] }],
  },
  {
    id: "temp",
    title: "Body temperature",
    unit: "°C",
    series: [{ key: "temp", label: "Temperature", codes: ["8310-5", "8331-1"], normal: [36.1, 37.2] }],
  },
  {
    id: "glucose",
    title: "Glucose",
    unit: "mg/dL",
    series: [{ key: "glucose", label: "Glucose", codes: ["2339-0", "2345-7", "15074-8"] }],
  },
];

/** Convert a value to the chart's canonical unit. Returns null if unusable. */
export function normalize(value, unit, canonical) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const u = (unit || "").toLowerCase();
  if (canonical === "kg") {
    if (u === "lb" || u === "[lb_av]" || u === "lbs") return value * LB_TO_KG;
    if (u === "g") return value / 1000;
  }
  if (canonical === "°C") {
    if (u === "degf" || u === "[degf]" || u === "f") return ((value - 32) * 5) / 9;
  }
  return value;
}

function hasCode(codeable, codes) {
  return (codeable?.coding || []).some((c) => codes.includes(c.code));
}

/** All {code-match, quantity} readings in an Observation (top level or components). */
function readings(obs, codes) {
  const out = [];
  if (hasCode(obs.code, codes) && obs.valueQuantity) out.push(obs.valueQuantity);
  for (const comp of obs.component || []) {
    if (hasCode(comp.code, codes) && comp.valueQuantity) out.push(comp.valueQuantity);
  }
  return out;
}

function obsTime(obs) {
  const raw = obs.effectiveDateTime || obs.effectivePeriod?.start || obs.issued;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? null : t;
}

/** Build rows [{t, <seriesKey>: number}] sorted by time for one chart. */
export function buildChartData(observations, chart) {
  const byTime = new Map();
  for (const obs of observations) {
    if (obs.resourceType !== "Observation" || obs.status === "entered-in-error") continue;
    const t = obsTime(obs);
    if (t === null) continue;
    for (const s of chart.series) {
      for (const q of readings(obs, s.codes)) {
        const v = normalize(q.value, q.unit || q.code, chart.unit);
        if (v === null) continue;
        const row = byTime.get(t) || { t };
        row[s.key] = Math.round(v * 10) / 10;
        byTime.set(t, row);
      }
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function patientSummary(patient) {
  const name = patient.name?.[0];
  const full = name ? [...(name.given || []), name.family].filter(Boolean).join(" ") : "Unknown patient";
  const dob = patient.birthDate;
  let age = null;
  if (dob) {
    const b = new Date(dob);
    const now = new Date();
    age = now.getFullYear() - b.getFullYear();
    if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age -= 1;
  }
  const initials = full
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return { name: full, gender: patient.gender || "unknown", birthDate: dob, age, initials };
}

// ---------- derived values for the UI ----------

/** "low" | "in" | "high", or null when there is no reference range. */
export function statusOf(value, normal) {
  if (!normal || typeof value !== "number") return null;
  const [lo, hi] = normal;
  if (lo !== null && value < lo) return "low";
  if (hi !== null && value > hi) return "high";
  return "in";
}

/** Latest value per series, with change vs the previous reading and range status. */
export function latestValues(data, chart) {
  return chart.series
    .map((s) => {
      const rows = data.filter((r) => r[s.key] !== undefined);
      if (rows.length === 0) return null;
      const last = rows[rows.length - 1];
      const prev = rows.length > 1 ? rows[rows.length - 2] : null;
      return {
        key: s.key,
        label: s.label,
        value: last[s.key],
        t: last.t,
        delta: prev ? Math.round((last[s.key] - prev[s.key]) * 10) / 10 : null,
        prevT: prev ? prev.t : null,
        status: statusOf(last[s.key], s.normal),
      };
    })
    .filter(Boolean);
}

/** Overall status of a chart: the first out-of-range series wins, else "in", else null. */
export function chartStatus(values) {
  const flagged = values.find((v) => v.status === "low" || v.status === "high");
  if (flagged) return flagged.status;
  return values.some((v) => v.status === "in") ? "in" : null;
}

/** Keep rows within `range` ("1y" | "5y" | "all") of an anchor time (default: latest row). */
export function filterRange(data, range, anchor) {
  if (range === "all" || data.length === 0) return data;
  const end = anchor ?? data[data.length - 1].t;
  const years = range === "1y" ? 1 : 5;
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - years);
  return data.filter((r) => r.t >= start.getTime() && r.t <= end);
}

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/**
 * A y-axis domain and tick list that fits the data without exaggerating small changes:
 * a flat line sits mid-chart instead of filling a 2-unit axis. Reference-range edges are
 * included when they are close enough to be useful.
 */
export function niceAxis(values, edges = []) {
  if (values.length === 0) return { domain: [0, 1], ticks: [0, 1] };
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.1, 1);
  lo -= span * 0.25;
  hi += span * 0.25;
  const near = [lo - span, hi + span];
  for (const e of edges) {
    if (e === null || e === undefined) continue;
    if (e >= near[0] && e <= near[1]) {
      lo = Math.min(lo, e);
      hi = Math.max(hi, e);
    }
  }
  const step = niceStep((hi - lo) / 4);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { domain: [start, end], ticks };
}
