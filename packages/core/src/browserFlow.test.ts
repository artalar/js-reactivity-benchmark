// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";

class WorkerFixture {
  static instances: WorkerFixture[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  terminated = false;
  request?: { framework: string; tests: string[] };
  constructor() {
    WorkerFixture.instances.push(this);
  }
  postMessage(request: { framework: string; tests: string[] }) {
    this.request = request;
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}
async function setup() {
  vi.resetModules();
  WorkerFixture.instances = [];
  localStorage.clear();
  document.body.innerHTML = '<main id="app"></main>';
  vi.stubGlobal("Worker", WorkerFixture);
  vi.stubGlobal("__LIBRARY_VERSIONS__", {});
  await import("../../web/src/index");
  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[name="framework"]',
  ))
    input.checked = input.value === "Alien Signals";
  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[name="test"]',
  ))
    input.checked = input.value === "diamond" || input.value === "mux";
  document.querySelector<HTMLButtonElement>("[data-run]")!.click();
}
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.head.querySelectorAll("style").forEach((style) => style.remove());
});
test("browser execution keeps partial results on stop and terminates the worker", async () => {
  await setup();
  const worker = WorkerFixture.instances[0];
  expect(worker.request?.tests).toEqual(["diamond", "mux"]);
  worker.emit({ type: "start", test: "diamond" });
  worker.emit({
    type: "outcome",
    outcome: { test: "diamond", time: 10, diagnostics: [] },
  });
  worker.emit({ type: "start", test: "mux" });
  document.querySelector<HTMLButtonElement>("[data-stop]")!.click();
  await vi.waitFor(() =>
    expect(document.querySelector("#results")!.textContent).toContain(
      "diamond",
    ),
  );
  expect(worker.terminated).toBe(true);
  expect(document.querySelector("#results")!.textContent).toContain(
    "interrupted",
  );
  expect(
    document.querySelector<HTMLButtonElement>("[data-run]")!.disabled,
  ).toBe(false);
});
test("browser restarts remaining cases after a worker crash", async () => {
  await setup();
  const first = WorkerFixture.instances[0];
  first.emit({ type: "start", test: "diamond" });
  first.onerror?.({ message: "fixture crash" });
  await vi.waitFor(() => expect(WorkerFixture.instances.length).toBe(2));
  const second = WorkerFixture.instances[1];
  expect(second.request?.tests).toEqual(["mux"]);
  second.emit({ type: "start", test: "mux" });
  second.emit({
    type: "outcome",
    outcome: { test: "mux", time: 20, diagnostics: [] },
  });
  second.emit({ type: "done" });
  await vi.waitFor(() =>
    expect(document.querySelector("#results")!.textContent).toContain(
      "fixture crash",
    ),
  );
  expect(document.querySelector("#results")!.textContent).toContain("crash");
  expect(document.querySelector("#results")!.textContent).toContain(
    "20.000 ms",
  );
});
