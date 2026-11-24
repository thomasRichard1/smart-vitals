// Pure helpers: turn FHIR Observation resources into chartable series.
// Kept free of React and network code so they are easy to unit test.

const LB_TO_KG = 0.45359237;

/** Each chart: which LOINC codes feed which series, and how to label it. */
export const CHARTS = [
  {
    id: "bp",
    title: "Blood pressure",
    unit: "mmHg",
    series: [
      { key: "systolic", label: "Systolic", codes: ["8480-6"] },
      { key: "diastolic", label: "Diastolic", codes: ["8462-4"] },
    ],
  },
  { id: "hr", title: "Heart rate", unit: "beats/min", series: [{ key: "hr", label: "Heart rate", codes: ["8867-4"] }] },
  { id: "weight", title: "Body weight", unit: "kg", series: [{ key: "weight", label: "Weight", codes: ["29463-7"] }] },
  { id: "temp", title: "Body temperature", unit: "°C", series: [{ key: "temp", label: "Temperature", codes: ["8310-5"] }] },
  {
    id: "glucose",
    title: "Glucose",
    unit: "mg/dL",
    series: [{ key: "glucose", label: "Glucose", codes: ["2339-0", "2345-7", "15074-8"] }],
  },
  { id: "ldl", title: "LDL cholesterol", unit: "mg/dL", series: [{ key: "ldl", label: "LDL", codes: ["18262-6", "13457-7", "2089-1"] }] },
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

/** Build rows [{t, date, <seriesKey>: number}] sorted by time for one chart. */
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
  return { name: full, gender: patient.gender || "unknown", birthDate: dob, age };
}
