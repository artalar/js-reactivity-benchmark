// @vitest-environment happy-dom
import { afterEach, expect, test } from "vitest";
import {
  analyzeReport,
  compatibilityIssues,
  parseReport,
  type Report,
} from "./results";
import { mountReport, reportDocument } from "./reportView";

function fixture(): Report {
  return {
    schemaVersion: 2,
    startedAt: "2026-11-13",
    duration: 100,
    concurrency: 1,
    node: "v24",
    platform: "test",
    cpu: "test",
    tests: ["diamond", "mux"],
    runs: [
      {
        framework: "A",
        status: "completed",
        duration: 10,
        diagnostics: [],
        outcomes: [
          { test: "diamond", time: 10, samples: [10, 12, 11], diagnostics: [] },
          { test: "mux", time: 20, diagnostics: [] },
        ],
      },
      {
        framework: "B",
        status: "completed",
        duration: 20,
        diagnostics: [],
        outcomes: [
          { test: "diamond", time: 20, diagnostics: [] },
          { test: "mux", status: "timeout", diagnostics: [] },
        ],
      },
    ],
  };
}
function mount() {
  const root = document.createElement("div");
  document.body.append(root);
  mountReport(root, fixture(), analyzeReport, compatibilityIssues, parseReport);
  return root;
}
function input(root: HTMLElement, selector: string, value: string) {
  const control = root.querySelector<HTMLInputElement>(selector)!;
  control.value = value;
  control.dispatchEvent(new Event("input"));
}
afterEach(() => {
  document.body.replaceChildren();
});
test("filters tests and switches baseline, metrics and matrix", () => {
  const root = mount();
  expect(root.textContent).toContain("See where the time goes");
  input(root, "[data-baseline]", "A");
  input(root, "[data-metric]", "percent");
  expect(root.querySelector("[data-content]")!.textContent).toContain(
    "+100.0%",
  );
  input(root, "[data-view]", "matrix");
  expect(root.querySelector("table.matrix")).not.toBeNull();
  input(root, "[data-query]", "diamond");
  expect(root.querySelector("table.matrix")!.textContent).not.toContain("mux");
});
test("retains explicit failure status and supports an empty selection", () => {
  const root = mount();
  expect(root.textContent).toContain("timeout");
  for (const checkbox of root.querySelectorAll<HTMLInputElement>(
    "[data-framework]",
  )) {
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
  }
  expect(root.textContent).toContain("No results match");
});
test("standalone HTML executes without imports or a server and escapes embedded data", () => {
  const report = fixture();
  report.cpu = '</script><script>throw new Error("injected")</script>';
  const html = reportDocument(report);
  expect(html.match(/<script>/g)).toHaveLength(1);
  const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
  document.body.innerHTML = '<main id="report"></main>';
  new Function("document", script)(document);
  expect(document.querySelector("#report")!.textContent).toContain("diamond");
  expect(document.querySelector("#report")!.textContent).toContain(report.cpu);
});
test("incompatible historical data stays gated until explicitly enabled", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const previous = fixture();
  previous.concurrency = 4;
  mountReport(
    root,
    fixture(),
    analyzeReport,
    compatibilityIssues,
    parseReport,
    previous,
  );
  expect(root.textContent).toContain("concurrency differs");
  expect(root.querySelector("[data-content]")!.textContent).not.toContain(
    "Previous run",
  );
  const allow = root.querySelector<HTMLInputElement>("[data-allow]")!;
  allow.checked = true;
  allow.dispatchEvent(new Event("change"));
  expect(root.querySelector("[data-content]")!.textContent).toContain(
    "Previous run",
  );
});
