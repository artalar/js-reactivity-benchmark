import { runTests } from "js-reactivity-benchmark/src/runner";
import { frameworkCatalog } from "js-reactivity-benchmark/src/frameworkCatalog";
import type {
  Diagnostic,
  TestOutcome,
} from "js-reactivity-benchmark/src/results";

interface RunMessage {
  framework: string;
  tests: string[];
}
let current: TestOutcome | undefined;
let messages = new Map<string, Diagnostic>();
const format = (value: unknown) => {
  if (value instanceof Error) return value.stack ?? value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};
function record(level: Diagnostic["level"], values: unknown[]) {
  const text = values.map(format).join(" ").slice(0, 8000);
  const key =
    messages.size >= 200 && !messages.has(`${level}:${text}`)
      ? `overflow:${level}`
      : `${level}:${text}`;
  const existing = messages.get(key);
  if (existing) existing.count++;
  else
    messages.set(key, {
      test: current?.test ?? "process",
      level,
      message: key.startsWith("overflow:")
        ? "Additional diagnostics omitted (200-message limit)."
        : text,
      count: 1,
    });
}
console.assert = (condition, ...values: unknown[]) => {
  if (!condition)
    record("error", values.length ? values : ["Assertion failed"]);
};
console.error = (...values: unknown[]) => record("error", values);
console.warn = (...values: unknown[]) => record("warning", values);
console.log =
  console.info =
  console.debug =
    (...values: unknown[]) => record("log", values);
function flush() {
  if (current) {
    current.diagnostics = [...messages.values()];
    self.postMessage({ type: "outcome", outcome: current });
  }
  messages = new Map();
}
self.onmessage = async ({ data }: MessageEvent<RunMessage>) => {
  try {
    const entry = frameworkCatalog.find(
      (entry) => entry.name === data.framework,
    );
    if (!entry) throw new Error("Unknown library");
    self.postMessage({ type: "start", test: "Loading library" });
    const framework = await entry.load();
    await runTests(
      [{ framework, testPullCounts: entry.testPullCounts }],
      (result) => {
        if (!Number.isFinite(result.time) || result.time < 0) {
          record("error", ["Invalid benchmark timing"]);
          return;
        }
        if (current) {
          current.time = result.time;
          current.samples = result.samples;
          current.measurements = result.measurements;
        }
      },
      {
        tests: data.tests,
        onStart: (_framework, test) => {
          flush();
          current = { test, diagnostics: [] };
          self.postMessage({ type: "start", test });
        },
        onError: (error) => record("error", [error]),
      },
    );
    flush();
    self.postMessage({ type: "done" });
  } catch (error) {
    record("error", [error]);
    flush();
    self.postMessage({
      type: "fatal",
      message: format(error),
      diagnostics: [...messages.values()],
    });
  }
};
