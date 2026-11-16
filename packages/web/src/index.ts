import { benchmarkCases } from "js-reactivity-benchmark/src/runner";
import { frameworkCatalog } from "js-reactivity-benchmark/src/frameworkCatalog";
import { benchmarkMetadata } from "js-reactivity-benchmark/src/benchmarkMetadata";
import {
  analyzeReport,
  compatibilityIssues,
  parseReport,
  type FrameworkRun,
  type Report,
  type TestOutcome,
} from "js-reactivity-benchmark/src/results";
import {
  mountReport,
  reportDocument,
  reportStyles,
} from "js-reactivity-benchmark/src/reportView";

declare const __LIBRARY_VERSIONS__: Record<string, string>;
const style = document.createElement("style");
style.textContent = reportStyles;
document.head.append(style);
const app = document.querySelector<HTMLElement>("#app")!;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const metadata = benchmarkCases.map(({ name }) => benchmarkMetadata(name));
const groups = [...new Set(metadata.map((item) => item.group))];
app.innerHTML = `<header><span class="eyebrow">JS Reactivity Benchmark / Browser</span><h1>Choose. Measure. Compare.</h1><p class="muted">Run selected libraries in isolated Web Workers. Explore the results here or save a standalone report.</p></header>
<div class="choice-grid"><section class="panel"><h2>1. Libraries</h2><input data-search="framework" type="search" placeholder="Find a library…" aria-label="Find a library"><div class="actions"><button data-toggle="framework" data-value="all">Select all</button><button data-toggle="framework" data-value="none">Clear</button><button data-toggle="framework" data-value="invert">Invert</button></div><div class="choice-list">${frameworkCatalog.map((entry) => `<label data-choice="framework"><input type="checkbox" name="framework" value="${escape(entry.name)}" checked> ${escape(entry.name)} <small>${escape(__LIBRARY_VERSIONS__[entry.name] ?? "unknown version")}</small></label>`).join("")}</div></section>
<section class="panel"><h2>2. Benchmarks</h2><input data-search="test" type="search" placeholder="Find a benchmark…" aria-label="Find a benchmark"><div class="actions"><button data-toggle="test" data-value="all">Select all</button><button data-toggle="test" data-value="none">Clear</button><button data-toggle="test" data-value="invert">Invert</button></div><div class="choice-list">${groups
  .map(
    (group) =>
      `<div><h3><button data-group="${escape(group)}">Toggle ${escape(group)}</button></h3>${metadata
        .filter((item) => item.group === group)
        .map(
          (item) =>
            `<label data-choice="test" data-test-group="${escape(group)}"><input type="checkbox" name="test" value="${escape(item.name)}" checked> ${escape(item.name)}<small>${escape(item.description)} ${escape(item.aggregation)}</small></label>`,
        )
        .join("")}</div>`,
  )
  .join("")}</div></section></div>
<section class="panel"><h2>3. Run settings</h2><div class="actions"><label>Mode <select data-mode><option value="compare">Compare · sequential workers</option><option value="quick">Quick check · concurrent workers</option></select></label><label>Timeout per test (s) <input data-timeout type="number" min="1" max="2147483" value="60"></label></div><div class="actions"><label>Profile name <input data-profile-name placeholder="my-comparison" maxlength="64"></label><button data-save-profile>Save profile</button><label>Load <select data-profiles><option value="">Saved profiles…</option></select></label><button data-delete-profile>Delete profile</button></div><p class="help">Tab moves between controls; Space toggles a checkbox; arrow keys navigate selects. Bulk actions apply to visible matches. Settings are remembered in this browser.</p><p data-selection class="help" aria-live="polite"></p><div class="actions"><button class="primary" data-run>Run selected benchmarks</button><button data-stop disabled>Stop & keep results</button><button data-download disabled>Save HTML report</button></div><progress data-progress value="0" max="1" aria-label="Benchmark progress"></progress><p data-status role="status">Ready.</p></section><div id="results"></div>`;
const element = <T extends HTMLElement>(selector: string) => {
  const found = app.querySelector<T>(selector);
  if (!found) throw new Error(`Missing control: ${selector}`);
  return found;
};
const selected = (name: string) =>
  [
    ...app.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`),
  ].map((input) => input.value);
interface BrowserSelection {
  frameworks: string[];
  tests: string[];
  mode: "compare" | "quick";
  timeout: number;
}
let profiles: Record<string, BrowserSelection> = Object.create(null);
function settings(): BrowserSelection {
  return {
    frameworks: selected("framework"),
    tests: selected("test"),
    mode:
      element<HTMLSelectElement>("[data-mode]").value === "quick"
        ? "quick"
        : "compare",
    timeout: Number(element<HTMLInputElement>("[data-timeout]").value),
  };
}
function validSettings(value: unknown): value is BrowserSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    "frameworks" in value &&
    Array.isArray(value.frameworks) &&
    value.frameworks.every((item) => typeof item === "string") &&
    "tests" in value &&
    Array.isArray(value.tests) &&
    value.tests.every((item) => typeof item === "string") &&
    "mode" in value &&
    ["compare", "quick"].includes(String(value.mode)) &&
    "timeout" in value &&
    typeof value.timeout === "number" &&
    Number.isInteger(value.timeout) &&
    value.timeout >= 1 &&
    value.timeout <= 2147483
  );
}
function restore(value: BrowserSelection) {
  for (const input of app.querySelectorAll<HTMLInputElement>(
    "input[name=framework]",
  ))
    input.checked = value.frameworks.includes(input.value);
  for (const input of app.querySelectorAll<HTMLInputElement>(
    "input[name=test]",
  ))
    input.checked = value.tests.includes(input.value);
  element<HTMLSelectElement>("[data-mode]").value = value.mode;
  element<HTMLInputElement>("[data-timeout]").value = String(value.timeout);
}
function update() {
  const configuration = settings();
  element("[data-selection]").textContent =
    `${configuration.frameworks.length} libraries × ${configuration.tests.length} benchmarks = ${configuration.frameworks.length * configuration.tests.length} results · ${configuration.mode}`;
  try {
    localStorage.setItem("reactivity:last", JSON.stringify(configuration));
  } catch {}
}
function profileList() {
  element<HTMLSelectElement>("[data-profiles]").innerHTML =
    '<option value="">Saved profiles…</option>' +
    Object.keys(profiles)
      .map((name) => `<option>${escape(name)}</option>`)
      .join("");
}
try {
  const last: unknown = JSON.parse(
    localStorage.getItem("reactivity:last") ?? "null",
  );
  if (validSettings(last)) restore(last);
  const saved: unknown = JSON.parse(
    localStorage.getItem("reactivity:profiles") ?? "{}",
  );
  if (saved && typeof saved === "object")
    for (const [name, value] of Object.entries(saved))
      if (validSettings(value)) profiles[name] = value;
} catch {
  element("[data-status]").textContent =
    "Saved settings could not be restored; using defaults.";
}
profileList();
update();
app.addEventListener("input", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.dataset.search)
    for (const label of app.querySelectorAll<HTMLElement>(
      `[data-choice="${input.dataset.search}"]`,
    ))
      label.hidden = !label.textContent
        ?.toLowerCase()
        .includes(input.value.toLowerCase());
  if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement)
    update();
});
app.addEventListener("click", (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("button")
      : null;
  if (!button) return;
  if (button.dataset.toggle || button.dataset.group) {
    const inputs = [
      ...app.querySelectorAll<HTMLInputElement>(
        button.dataset.group
          ? `input[name="test"]`
          : `input[name="${button.dataset.toggle}"]`,
      ),
    ].filter(
      (input) =>
        !input.closest<HTMLElement>("[data-choice]")?.hidden &&
        (!button.dataset.group ||
          input.closest<HTMLElement>("[data-test-group]")?.dataset.testGroup ===
            button.dataset.group),
    );
    const enable = inputs.some((input) => !input.checked);
    for (const input of inputs)
      input.checked = button.dataset.group
        ? enable
        : button.dataset.value === "all"
          ? true
          : button.dataset.value === "none"
            ? false
            : !input.checked;
    update();
  }
});
element("[data-save-profile]").addEventListener("click", () => {
  const name = element<HTMLInputElement>("[data-profile-name]").value.trim();
  if (!/^[\w.-]{1,64}$/.test(name)) {
    element("[data-status]").textContent =
      "Profile names use letters, digits, dots, underscores or hyphens.";
    return;
  }
  profiles[name] = settings();
  try {
    localStorage.setItem("reactivity:profiles", JSON.stringify(profiles));
    profileList();
    element("[data-status]").textContent = `Saved profile: ${name}`;
  } catch {
    element("[data-status]").textContent = "Browser storage is unavailable.";
  }
});
element<HTMLSelectElement>("[data-profiles]").addEventListener(
  "change",
  (event) => {
    const profile = profiles[(event.currentTarget as HTMLSelectElement).value];
    if (profile) {
      restore(profile);
      update();
    }
  },
);
element("[data-delete-profile]").addEventListener("click", () => {
  const name = element<HTMLSelectElement>("[data-profiles]").value;
  if (!name) return;
  delete profiles[name];
  try {
    localStorage.setItem("reactivity:profiles", JSON.stringify(profiles));
    profileList();
  } catch {
    element("[data-status]").textContent = "Browser storage is unavailable.";
  }
});
let report: Report | undefined;
let running = false;
let stopped = false;
const workers = new Map<Worker, () => void>();
function showReport() {
  if (!report) return;
  const container = document.createElement("div");
  element("#results").replaceChildren(container);
  mountReport(
    container,
    report,
    analyzeReport,
    compatibilityIssues,
    parseReport,
  );
  element<HTMLButtonElement>("[data-download]").disabled = false;
}
function stop() {
  stopped = true;
  for (const cancel of [...workers.values()]) cancel();
}
element("[data-stop]").addEventListener("click", stop);
window.addEventListener("beforeunload", () => {
  for (const worker of workers.keys()) worker.terminate();
});
function runLibrary(
  framework: string,
  tests: string[],
  timeout: number,
): Promise<FrameworkRun> {
  return new Promise((resolve) => {
    const start = performance.now();
    const run: FrameworkRun = {
      framework,
      status: "completed",
      duration: 0,
      outcomes: [],
      diagnostics: [],
    };
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    let active: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    function finish(status: FrameworkRun["status"], message?: string) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      workers.delete(worker);
      run.status = status;
      run.duration = performance.now() - start;
      if (
        active &&
        tests.includes(active) &&
        !run.outcomes.some((outcome) => outcome.test === active)
      )
        run.outcomes.push({
          test: active,
          status: stopped
            ? "interrupted"
            : status === "timeout"
              ? "timeout"
              : "crash",
          diagnostics: message
            ? [{ test: active, level: "error", message, count: 1 }]
            : [],
        });
      else if (message)
        run.diagnostics.push({
          test: "process",
          level: "error",
          message,
          count: 1,
        });
      resolve(run);
    }
    function refresh() {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          finish(
            "timeout",
            `Test or worker startup exceeded ${timeout}s timeout`,
          ),
        timeout * 1000,
      );
    }
    workers.set(worker, () => finish("interrupted"));
    worker.onerror = (event) =>
      finish("failed", event.message || "Worker failed");
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      type: string;
      test?: string;
      outcome?: TestOutcome;
      message?: string;
    }>) => {
      if (data.type === "start") {
        active = data.test;
        refresh();
        element("[data-status]").textContent =
          `${framework} / ${active} · ${workers.size} worker(s) active`;
      }
      if (data.type === "outcome" && data.outcome) {
        run.outcomes.push(data.outcome);
        active = undefined;
        refresh();
        element<HTMLProgressElement>("[data-progress]").value++;
      }
      if (data.type === "done") finish("completed");
      if (data.type === "fatal")
        finish("failed", data.message ?? "Worker failed");
    };
    refresh();
    worker.postMessage({ framework, tests });
  });
}
element("[data-run]").addEventListener("click", async () => {
  if (running) return;
  const configuration = settings();
  if (
    !configuration.frameworks.length ||
    !configuration.tests.length ||
    !Number.isSafeInteger(configuration.timeout) ||
    configuration.timeout < 1 ||
    configuration.timeout > 2147483
  ) {
    element("[data-status]").textContent =
      "Select a library and a benchmark, and a timeout from 1 to 2147483 seconds.";
    return;
  }
  running = true;
  stopped = false;
  element("#results").replaceChildren();
  element<HTMLButtonElement>("[data-run]").disabled = true;
  element<HTMLButtonElement>("[data-stop]").disabled = false;
  element<HTMLButtonElement>("[data-download]").disabled = true;
  const controls = [
    ...app.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >(
      "input,select,button[data-toggle],button[data-group],button[data-save-profile],button[data-delete-profile]",
    ),
  ];
  controls.forEach((control) => (control.disabled = true));
  const progress = element<HTMLProgressElement>("[data-progress]");
  progress.value = 0;
  progress.max = configuration.frameworks.length * configuration.tests.length;
  const start = performance.now();
  const concurrency =
    configuration.mode === "compare"
      ? 1
      : Math.min(
          navigator.hardwareConcurrency || 2,
          configuration.frameworks.length,
        );
  report = {
    schemaVersion: 2,
    startedAt: new Date().toISOString(),
    duration: 0,
    concurrency,
    node: navigator.userAgent,
    platform: navigator.platform,
    cpu: `${navigator.hardwareConcurrency || "unknown"} logical CPUs`,
    environment: "browser",
    mode: configuration.mode,
    timeout: configuration.timeout,
    gc: typeof Reflect.get(globalThis, "gc") === "function",
    metadata: metadata.filter((item) =>
      configuration.tests.includes(item.name),
    ),
    versions: __LIBRARY_VERSIONS__,
    tests: configuration.tests,
    runs: [],
  };
  const activeReport = report;
  const queue = [...configuration.frameworks];
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (queue.length && !stopped) {
          const framework = queue.shift()!;
          let remaining = configuration.tests;
          const combined: FrameworkRun = {
            framework,
            status: "completed",
            duration: 0,
            outcomes: [],
            diagnostics: [],
          };
          while (remaining.length && !stopped) {
            const attempt = await runLibrary(
              framework,
              remaining,
              configuration.timeout,
            );
            combined.outcomes.push(...attempt.outcomes);
            combined.diagnostics.push(...attempt.diagnostics);
            combined.duration += attempt.duration;
            if (attempt.status !== "completed")
              combined.status = attempt.status;
            if (!attempt.outcomes.length) break;
            const attempted = new Set(
              attempt.outcomes.map((outcome) => outcome.test),
            );
            remaining = remaining.filter((test) => !attempted.has(test));
          }
          if (stopped) combined.status = "interrupted";
          activeReport.runs.push(combined);
        }
      }),
    );
    for (const framework of queue)
      activeReport.runs.push({
        framework,
        status: "interrupted",
        duration: 0,
        outcomes: [],
        diagnostics: [],
      });
    activeReport.runs.sort(
      (a, b) =>
        configuration.frameworks.indexOf(a.framework) -
        configuration.frameworks.indexOf(b.framework),
    );
    activeReport.duration = performance.now() - start;
    progress.value = activeReport.runs.reduce(
      (sum, run) => sum + run.outcomes.length,
      0,
    );
    element("[data-status]").textContent =
      `${stopped ? "Stopped; partial results saved below" : "Finished"} · ${(activeReport.duration / 1000).toFixed(1)}s`;
    showReport();
  } catch (error) {
    stop();
    element("[data-status]").textContent = `Run failed: ${String(error)}`;
    activeReport.duration = performance.now() - start;
    showReport();
  } finally {
    running = false;
    element<HTMLButtonElement>("[data-run]").disabled = false;
    element<HTMLButtonElement>("[data-stop]").disabled = true;
    controls.forEach((control) => (control.disabled = false));
  }
});
element("[data-download]").addEventListener("click", () => {
  if (!report) return;
  const url = URL.createObjectURL(
    new Blob([reportDocument(report)], { type: "text/html" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "reactivity-report.html";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
