import { libraryVersions } from "./versions";
import { openSync, writeFileSync } from "node:fs";
import { benchmarkMetadata } from "js-reactivity-benchmark/src/benchmarkMetadata";
import { once } from "node:events";
import { format } from "node:util";
import type { Diagnostic, TestOutcome, WorkerMessage } from "./protocol";

function send(message: WorkerMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!process.send) return reject(new Error("Missing parent IPC channel"));
    process.send(message, (error: Error | null) =>
      error ? reject(error) : resolve(),
    );
  });
}

const journal = process.argv[4] ? openSync(process.argv[4], "w") : undefined;
let nextDiagnosticId = 0;
const diagnosticIds = new Map<Diagnostic, number>();

function persist(diagnostic: Diagnostic) {
  if (journal === undefined) return;
  const existingId = diagnosticIds.get(diagnostic);
  if (existingId !== undefined) {
    writeFileSync(journal, JSON.stringify(existingId) + "\n");
  } else {
    const id = nextDiagnosticId++;
    diagnosticIds.set(diagnostic, id);
    writeFileSync(journal, JSON.stringify({ id, diagnostic }) + "\n");
  }
}

let current: TestOutcome | undefined;
let diagnostics = new Map<string, Diagnostic>();

function record(level: Diagnostic["level"], values: unknown[]) {
  const message = format(...values).slice(0, 8000);
  const key = `${level}\0${message}`;
  const existing = diagnostics.get(key);
  if (existing) {
    existing.count++;
    persist(existing);
    return;
  }
  const overflow = diagnostics.size >= 200;
  const storageKey = overflow ? `overflow-${level}` : key;
  let diagnostic = diagnostics.get(storageKey);
  if (diagnostic) diagnostic.count++;
  else {
    diagnostic = {
      test: current?.test ?? "process",
      level,
      message: overflow
        ? "Additional distinct diagnostics omitted (200-message limit per test)"
        : message,
      count: 1,
    };
    diagnostics.set(storageKey, diagnostic);
  }
  persist(diagnostic);
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

async function flush() {
  if (current) {
    current.diagnostics =
      journal === undefined ? [...diagnostics.values()] : [];
    await send({ type: "outcome", outcome: current });
  } else if (diagnostics.size && journal === undefined) {
    await send({ type: "diagnostics", diagnostics: [...diagnostics.values()] });
  }
  diagnostics = new Map();
  diagnosticIds.clear();
}

async function main() {
  const { benchmarkCases, runTests } =
    await import("js-reactivity-benchmark/src/runner");
  const { frameworkCatalog } =
    await import("js-reactivity-benchmark/src/frameworkCatalog");
  if (process.argv[2] === "--list") {
    await send({
      type: "catalog",
      frameworks: frameworkCatalog.map(({ name }) => name),
      tests: benchmarkCases.map(({ name }) => name),
      metadata: benchmarkCases.map(({ name }) => benchmarkMetadata(name)),
      versions: libraryVersions(
        frameworkCatalog,
        new URL("../../core/package.json", import.meta.url),
        new URL("../../core/src/", import.meta.url),
      ),
    });
    return;
  }
  const selected = frameworkCatalog.find(
    ({ name }) => name === process.argv[2],
  );
  if (!selected) throw new Error(`Unknown framework ${process.argv[2]}`);
  const tests: string[] = JSON.parse(process.argv[3]);
  await runTests(
    [
      {
        framework: await selected.load(),
        testPullCounts: selected.testPullCounts,
      },
    ],
    (result) => {
      if (!Number.isFinite(result.time) || result.time < 0) {
        record("error", ["Invalid benchmark timing", result.time]);
        return;
      }
      if (current) {
        current.time = result.time;
        current.samples = result.samples;
        current.measurements = result.measurements;
      }
    },
    {
      tests,
      onStart: async (_framework, test) => {
        await flush();
        current = { test, diagnostics: [] };
        const ready = once(process, "message");
        await send({ type: "start", test });
        await ready;
      },
      onError: (error) => record("error", [error]),
    },
  );
  await flush();
  await send({ type: "done" });
}

main()
  .catch(async (error: unknown) => {
    record("error", [error]);
    await flush();
    await send({ type: "fatal", message: format(error) });
    process.exitCode = 1;
  })
  .finally(() => process.disconnect?.());
