import { expect, test } from "vitest";
import {
  analyzeReport,
  compatibilityIssues,
  outcomeStatus,
  parseReport,
  type Report,
} from "./results";

export function fixture(): Report {
  return {
    schemaVersion: 2,
    environment: "node",
    startedAt: "2026-11-13T00:00:00Z",
    duration: 100,
    concurrency: 1,
    node: "v24",
    platform: "test",
    cpu: "test",
    gc: true,
    tests: ["diamond", "mux"],
    runs: [
      {
        framework: "A",
        status: "completed",
        duration: 20,
        diagnostics: [],
        outcomes: [
          { test: "diamond", time: 10, diagnostics: [] },
          { test: "mux", time: 40, diagnostics: [] },
        ],
      },
      {
        framework: "B",
        status: "completed",
        duration: 20,
        diagnostics: [],
        outcomes: [
          { test: "diamond", time: 20, diagnostics: [] },
          { test: "mux", time: 10, diagnostics: [] },
        ],
      },
    ],
  };
}
test("computes time ratios and percentages relative to a selected baseline", () => {
  const analysis = analyzeReport(fixture(), "A");
  expect(analysis.rows[0].entries[1].ratio).toBe(2);
  expect(analysis.rows[0].entries[1].percent).toBe(100);
  expect(analysis.rows[1].entries[1].percent).toBe(-75);
  expect(analysis.summary[1].ratio).toBeCloseTo(Math.sqrt(0.5));
});
test("uses shared valid coverage and never rewards failed validations", () => {
  const report = fixture();
  report.runs[1].outcomes[0].diagnostics.push({
    test: "diamond",
    level: "error",
    message: "invalid",
    count: 1,
  });
  const result = analyzeReport(report);
  expect(result.rows[0].entries[1].time).toBeUndefined();
  expect(result.rows[0].entries[1].status).toBe("failed");
  expect(result.common).toBe(1);
  expect(result.summary.map((entry) => entry.covered)).toEqual([1, 1]);
  expect(result.summary[0].ratio).toBe(4);
});
test("excludes zero baselines, handles missing and interrupted outcomes", () => {
  const report = fixture();
  report.runs[0].outcomes[0].time = 0;
  expect(analyzeReport(report).rows[0].entries[1].ratio).toBeUndefined();
  expect(analyzeReport(report).common).toBe(1);
  expect(
    outcomeStatus(undefined, { ...report.runs[0], status: "interrupted" }),
  ).toBe("interrupted");
  expect(outcomeStatus(undefined)).toBe("not run");
  expect(outcomeStatus({ test: "x", time: NaN, diagnostics: [] })).toBe(
    "failed",
  );
});
test("compares the same library and test across runs, detects incompatible settings", () => {
  const current = fixture();
  const previous = fixture();
  previous.runs[1].outcomes[0].time = 10;
  expect(
    analyzeReport(current, "fastest", undefined, undefined, previous).rows[0]
      .entries[1].change,
  ).toBe(100);
  expect(compatibilityIssues(current, previous)).toEqual([]);
  previous.concurrency = 2;
  expect(compatibilityIssues(current, previous)).toContain(
    "concurrency differs between runs.",
  );
});
test("rejects malformed imported reports", () => {
  expect(parseReport(fixture())).toEqual(fixture());
  expect(() => parseReport({})).toThrow();
  const report = fixture();
  report.runs[0].outcomes[0].time = Infinity;
  expect(() => parseReport(report)).toThrow();
  expect(() => parseReport({ ...fixture(), metadata: [null] })).toThrow();
});
