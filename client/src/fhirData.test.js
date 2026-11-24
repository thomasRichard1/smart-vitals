import { describe, expect, it } from "vitest";
import {
  CHARTS,
  buildChartData,
  chartStatus,
  filterRange,
  latestValues,
  niceAxis,
  normalize,
  patientSummary,
  statusOf,
} from "./fhirData.js";

const bp = (date, sys, dia) => ({
  resourceType: "Observation",
  status: "final",
  effectiveDateTime: date,
  code: { coding: [{ code: "85354-9" }] },
  component: [
    { code: { coding: [{ code: "8480-6" }] }, valueQuantity: { value: sys, unit: "mmHg" } },
    { code: { coding: [{ code: "8462-4" }] }, valueQuantity: { value: dia, unit: "mmHg" } },
  ],
});

describe("buildChartData", () => {
  it("reads blood pressure components and sorts by time", () => {
    const rows = buildChartData([bp("2020-02-01", 130, 85), bp("2019-01-01", 120, 80)], CHARTS[0]);
    expect(rows.map((r) => r.systolic)).toEqual([120, 130]);
    expect(rows[0].diastolic).toBe(80);
  });

  it("converts pounds to kg and skips entered-in-error", () => {
    const weight = CHARTS.find((c) => c.id === "weight");
    const obs = (status, value, unit) => ({
      resourceType: "Observation",
      status,
      effectiveDateTime: "2021-05-05",
      code: { coding: [{ code: "29463-7" }] },
      valueQuantity: { value, unit },
    });
    expect(buildChartData([obs("final", 150, "[lb_av]")], weight)[0].weight).toBe(68);
    expect(buildChartData([obs("entered-in-error", 150, "lb")], weight)).toEqual([]);
  });
});

describe("normalize", () => {
  it("converts Fahrenheit to Celsius", () => {
    expect(normalize(98.6, "degF", "°C")).toBeCloseTo(37, 1);
  });
  it("rejects non-numbers", () => {
    expect(normalize(undefined, "kg", "kg")).toBeNull();
  });
});

describe("patientSummary", () => {
  it("joins the name and tolerates a missing birth date", () => {
    const s = patientSummary({ name: [{ given: ["Ada"], family: "Lovelace" }], gender: "female" });
    expect(s).toMatchObject({ name: "Ada Lovelace", age: null });
  });
});

describe("statusOf", () => {
  it("compares against a closed range", () => {
    expect(statusOf(115, [90, 120])).toBe("in");
    expect(statusOf(133, [90, 120])).toBe("high");
    expect(statusOf(80, [90, 120])).toBe("low");
  });
  it("supports an open upper end and no range", () => {
    expect(statusOf(55, [40, null])).toBe("in");
    expect(statusOf(30, [40, null])).toBe("low");
    expect(statusOf(100, undefined)).toBeNull();
  });
});

describe("latestValues", () => {
  const rows = [
    { t: 1, systolic: 120, diastolic: 80 },
    { t: 2, systolic: 133.4, diastolic: 75 },
  ];
  it("returns latest value, change and status per series", () => {
    const [sys, dia] = latestValues(rows, CHARTS[0]);
    expect(sys).toMatchObject({ value: 133.4, delta: 13.4, status: "high" });
    expect(dia).toMatchObject({ value: 75, delta: -5, status: "in" });
  });
  it("has no delta for a single reading, and chartStatus picks the flagged series", () => {
    const [only] = latestValues([{ t: 1, systolic: 110 }], CHARTS[0]);
    expect(only.delta).toBeNull();
    expect(chartStatus(latestValues(rows, CHARTS[0]))).toBe("high");
  });
});

describe("filterRange", () => {
  const day = 86400000;
  const rows = [0, 200, 400, 800, 2000].map((d) => ({ t: Date.UTC(2020, 0, 1) + d * day }));
  it("keeps everything for all, and measures back from the latest reading", () => {
    expect(filterRange(rows, "all")).toHaveLength(5);
    expect(filterRange(rows, "1y")).toHaveLength(1);
    expect(filterRange(rows, "5y")).toHaveLength(4); // day 0 is more than 5 years before day 2000
  });
});

describe("niceAxis", () => {
  it("centres a flat line instead of stretching the axis around it", () => {
    const { domain, ticks } = niceAxis([87.4, 87.4]);
    expect(domain[0]).toBeLessThan(87.4);
    expect(domain[1]).toBeGreaterThan(87.4);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });
  it("includes a nearby range edge but ignores a distant one", () => {
    const { domain } = niceAxis([68.5, 83], [0, 100]);
    expect(domain[1]).toBeGreaterThanOrEqual(100);
    expect(domain[0]).toBeGreaterThan(0);
  });
});
