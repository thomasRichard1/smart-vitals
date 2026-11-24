import { describe, expect, it } from "vitest";
import { CHARTS, buildChartData, normalize, patientSummary } from "./fhirData.js";

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
