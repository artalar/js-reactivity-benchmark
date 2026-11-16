export interface Diagnostic {
  test: string;
  level: "error" | "warning" | "log";
  message: string;
  count: number;
}

export interface TestOutcome {
  test: string;
  time?: number;
  samples?: number[];
  measurements?: { name: string; samples: number[] }[];
  status?: "passed" | "failed" | "timeout" | "crash" | "interrupted";
  diagnostics: Diagnostic[];
}

export interface FrameworkRun {
  framework: string;
  status: "completed" | "failed" | "timeout" | "interrupted";
  duration: number;
  outcomes: TestOutcome[];
  diagnostics: Diagnostic[];
}

export interface TestMetadata {
  id: string;
  name: string;
  group: string;
  description: string;
  aggregation: string;
  parameters?: Record<string, number>;
}

export interface Report {
  schemaVersion?: number;
  startedAt: string;
  duration: number;
  concurrency: number;
  node: string;
  platform: string;
  cpu: string;
  tests: string[];
  runs: FrameworkRun[];
  environment?: "node" | "browser";
  mode?: "compare" | "quick";
  timeout?: number;
  gc?: boolean;
  commit?: string;
  dirty?: boolean;
  command?: string;
  versions?: Record<string, string>;
  metadata?: TestMetadata[];
}

export function outcomeStatus(
  outcome: TestOutcome | undefined,
  run?: FrameworkRun,
): string {
  if (!outcome)
    return run?.status === "interrupted" ? "interrupted" : "not run";
  if (outcome.status && outcome.status !== "passed") return outcome.status;
  return Number.isFinite(outcome.time) &&
    outcome.time! >= 0 &&
    !outcome.diagnostics.some((item) => item.level === "error")
    ? "passed"
    : "failed";
}

export function analyzeReport(
  report: Report,
  baseline = "fastest",
  frameworks = report.runs.map((run) => run.framework),
  tests = report.tests,
  previous?: Report,
) {
  const valid = (outcome: TestOutcome | undefined) =>
    outcome !== undefined &&
    Number.isFinite(outcome.time) &&
    outcome.time! >= 0 &&
    (!outcome.status || outcome.status === "passed") &&
    !outcome.diagnostics.some((item) => item.level === "error");
  const runs = report.runs.filter((run) => frameworks.includes(run.framework));
  const rows = tests.map((test) => {
    const entries = runs.map((run) => {
      const outcome = run.outcomes.find((item) => item.test === test);
      const oldOutcome = previous?.runs
        .find((item) => item.framework === run.framework)
        ?.outcomes.find((item) => item.test === test);
      const time = valid(outcome) ? outcome!.time : undefined;
      const oldTime = valid(oldOutcome) ? oldOutcome!.time : undefined;
      const status = !outcome
        ? run.status === "interrupted"
          ? "interrupted"
          : "not run"
        : outcome.status && outcome.status !== "passed"
          ? outcome.status
          : valid(outcome)
            ? "passed"
            : "failed";
      return {
        framework: run.framework,
        time,
        status,
        previousTime: oldTime,
        newFailure: valid(oldOutcome) && !valid(outcome),
        change:
          time !== undefined && oldTime !== undefined && oldTime > 0
            ? (time / oldTime - 1) * 100
            : undefined,
        ratio: undefined as number | undefined,
        percent: undefined as number | undefined,
      };
    });
    const times = entries.flatMap((entry) =>
      entry.time === undefined ? [] : [entry.time],
    );
    const best = times.length ? Math.min(...times) : undefined;
    const reference =
      baseline === "fastest"
        ? best
        : entries.find((entry) => entry.framework === baseline)?.time;
    for (const entry of entries) {
      if (
        entry.time !== undefined &&
        reference !== undefined &&
        reference > 0
      ) {
        entry.ratio = entry.time / reference;
        entry.percent = (entry.ratio - 1) * 100;
      }
    }
    return { test, entries, best, max: Math.max(...times, 0.001), reference };
  });
  const common = rows.filter(
    (row) =>
      row.entries.length > 0 &&
      row.entries.every(
        (entry) =>
          entry.time !== undefined &&
          entry.time > 0 &&
          entry.ratio !== undefined,
      ),
  );
  const summary = runs.map((run) => {
    const ratios = common.map(
      (row) =>
        row.entries.find((entry) => entry.framework === run.framework)!.ratio!,
    );
    return {
      framework: run.framework,
      covered: ratios.length,
      total: tests.length,
      ratio: ratios.length
        ? Math.exp(
            ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) /
              ratios.length,
          )
        : undefined,
      passed: rows.filter((row) =>
        row.entries.some(
          (entry) =>
            entry.framework === run.framework && entry.status === "passed",
        ),
      ).length,
    };
  });
  return { rows, summary, common: common.length };
}

export function compatibilityIssues(
  current: Report,
  previous: Report,
): string[] {
  const issues: string[] = [];
  if (!current.schemaVersion || !previous.schemaVersion)
    issues.push("Legacy report: measurement metadata is incomplete.");
  for (const key of [
    "schemaVersion",
    "mode",
    "timeout",
    "environment",
    "node",
    "platform",
    "cpu",
    "concurrency",
    "gc",
  ] as const) {
    if (current[key] !== previous[key])
      issues.push(`${key} differs between runs.`);
  }
  for (const test of current.tests.filter((name) =>
    previous.tests.includes(name),
  )) {
    const now = current.metadata?.find((item) => item.name === test);
    const before = previous.metadata?.find((item) => item.name === test);
    if (JSON.stringify(now) !== JSON.stringify(before))
      issues.push(`Method or parameters differ: ${test}`);
  }
  return issues;
}

export function parseReport(value: unknown): Report {
  const object = (item: unknown): item is Record<string, unknown> =>
    typeof item === "object" && item !== null;
  const finite = (item: unknown): item is number =>
    typeof item === "number" && Number.isFinite(item) && item >= 0;
  const strings = (item: unknown): item is string[] =>
    Array.isArray(item) && item.every((part) => typeof part === "string");
  const optionalString = (item: unknown) =>
    item === undefined || typeof item === "string";
  const optionalBoolean = (item: unknown) =>
    item === undefined || typeof item === "boolean";
  const samples = (item: unknown) =>
    item === undefined || (Array.isArray(item) && item.every(finite));
  const diagnostic = (item: unknown): item is Diagnostic =>
    object(item) &&
    typeof item.test === "string" &&
    ["error", "warning", "log"].includes(String(item.level)) &&
    typeof item.message === "string" &&
    finite(item.count);
  const outcome = (item: unknown): item is TestOutcome =>
    object(item) &&
    typeof item.test === "string" &&
    (item.time === undefined || finite(item.time)) &&
    (item.status === undefined ||
      ["passed", "failed", "timeout", "crash", "interrupted"].includes(
        String(item.status),
      )) &&
    Array.isArray(item.diagnostics) &&
    item.diagnostics.every(diagnostic) &&
    samples(item.samples) &&
    (item.measurements === undefined ||
      (Array.isArray(item.measurements) &&
        item.measurements.every(
          (measurement) =>
            object(measurement) &&
            typeof measurement.name === "string" &&
            Array.isArray(measurement.samples) &&
            measurement.samples.every(finite),
        )));
  const run = (item: unknown): item is FrameworkRun =>
    object(item) &&
    typeof item.framework === "string" &&
    ["completed", "failed", "timeout", "interrupted"].includes(
      String(item.status),
    ) &&
    finite(item.duration) &&
    Array.isArray(item.diagnostics) &&
    item.diagnostics.every(diagnostic) &&
    Array.isArray(item.outcomes) &&
    item.outcomes.every(outcome) &&
    new Set(item.outcomes.map((outcome) => outcome.test)).size ===
      item.outcomes.length;
  const metadata = (item: unknown): item is TestMetadata =>
    object(item) &&
    [item.id, item.name, item.group, item.description, item.aggregation].every(
      (part) => typeof part === "string",
    ) &&
    (item.parameters === undefined ||
      (object(item.parameters) &&
        Object.values(item.parameters).every(finite)));
  const report = (item: unknown): item is Report =>
    object(item) &&
    typeof item.startedAt === "string" &&
    finite(item.duration) &&
    finite(item.concurrency) &&
    [item.node, item.platform, item.cpu].every(
      (part) => typeof part === "string",
    ) &&
    strings(item.tests) &&
    new Set(item.tests).size === item.tests.length &&
    Array.isArray(item.runs) &&
    item.runs.every(run) &&
    new Set(item.runs.map((run) => run.framework)).size === item.runs.length &&
    (item.metadata === undefined ||
      (Array.isArray(item.metadata) && item.metadata.every(metadata))) &&
    (item.schemaVersion === undefined || finite(item.schemaVersion)) &&
    (item.timeout === undefined || finite(item.timeout)) &&
    optionalBoolean(item.gc) &&
    optionalBoolean(item.dirty) &&
    optionalString(item.command) &&
    optionalString(item.commit) &&
    (item.environment === undefined ||
      ["node", "browser"].includes(String(item.environment))) &&
    (item.mode === undefined ||
      ["compare", "quick"].includes(String(item.mode))) &&
    (item.versions === undefined ||
      (object(item.versions) &&
        Object.values(item.versions).every(
          (version) => typeof version === "string",
        )));
  if (!report(value))
    throw new Error(
      "Invalid benchmark report: check results, diagnostics and measurement metadata",
    );
  return value;
}
