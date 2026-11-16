import { execFileSync, fork, spawn } from "node:child_process";
import { availableParallelism, cpus, tmpdir } from "node:os";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import type {
  FrameworkRun,
  Report,
  TestOutcome,
  WorkerMessage,
} from "./protocol";
import { readDiagnostics } from "./diagnostics";
import { chooseRun, filterNames, readPreferences } from "./selection";
import { Progress } from "./progress";
import {
  parseReport,
  type Report as SharedReport,
} from "js-reactivity-benchmark/src/results";
import { renderHtml, renderCsv, renderMarkdown, printReport } from "./report";

const workerPath = fileURLToPath(new URL("./worker.mjs", import.meta.url));
const children = new Set<ReturnType<typeof fork>>();
let interrupted = false;
const cancellation = new AbortController();
let progress: Progress | undefined;

function stop() {
  interrupted = true;
  cancellation.abort();
  for (const child of children) child.kill("SIGKILL");
}

function catalog(): Promise<Extract<WorkerMessage, { type: "catalog" }>> {
  return new Promise((resolveCatalog, reject) => {
    const child = fork(workerPath, ["--list"], { silent: true });
    children.add(child);
    let output = "";
    let result: Extract<WorkerMessage, { type: "catalog" }> | undefined;
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      output = (output + chunk).slice(-16000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
    child.on("message", (message: WorkerMessage) => {
      if (message.type === "catalog") result = message;
      if (message.type === "fatal") output += message.message;
    });
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      children.delete(child);
      if (result) resolveCatalog(result);
      else reject(new Error(`Could not load benchmark catalog. ${output}`));
    });
  });
}

async function runProcess(
  framework: string,
  tests: string[],
  timeout: number,
): Promise<FrameworkRun> {
  const directory = await mkdtemp(resolve(tmpdir(), "reactivity-diagnostics-"));
  const journalPath = resolve(directory, "diagnostics.jsonl");
  if (interrupted) {
    await rm(directory, { recursive: true, force: true });
    return {
      framework,
      status: "interrupted",
      duration: 0,
      outcomes: [],
      diagnostics: [],
    };
  }
  return new Promise((resolveRun) => {
    const start = performance.now();
    const run: FrameworkRun = {
      framework,
      status: "failed",
      duration: 0,
      outcomes: [],
      diagnostics: [],
    };
    const child = fork(
      workerPath,
      [framework, JSON.stringify(tests), journalPath],
      {
        silent: true,
        execArgv: ["--expose-gc"],
      },
    );
    children.add(child);
    let activeTest = "process";
    let completed = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(0, 32000);
    });
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(0, 32000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);
    child.on("message", (message: WorkerMessage) => {
      switch (message.type) {
        case "start":
          activeTest = message.test;
          progress?.active(framework, message.test);
          timer.refresh();
          if (child.connected)
            child.send({ type: "ready", test: message.test }, () => {});
          break;
        case "outcome":
          run.outcomes.push(message.outcome);
          progress?.finishTest();
          activeTest = "process";
          timer.refresh();
          break;
        case "diagnostics":
          run.diagnostics.push(...message.diagnostics);
          break;
        case "done":
          completed = true;
          child.kill("SIGKILL");
          break;
        case "fatal":
          run.diagnostics.push({
            test: activeTest,
            level: "error",
            message: message.message,
            count: 1,
          });
          child.kill("SIGKILL");
          break;
      }
    });
    child.on("error", (error) => {
      run.diagnostics.push({
        test: activeTest,
        level: "error",
        message: error.message,
        count: 1,
      });
    });
    child.on("close", async (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      run.duration = performance.now() - start;
      run.status = completed
        ? "completed"
        : interrupted
          ? "interrupted"
          : timedOut
            ? "timeout"
            : "failed";
      const interruptedOutcome: TestOutcome | undefined =
        !completed &&
        activeTest !== "process" &&
        !run.outcomes.some((outcome) => outcome.test === activeTest)
          ? {
              test: activeTest,
              status: interrupted
                ? "interrupted"
                : timedOut
                  ? "timeout"
                  : "crash",
              diagnostics: [],
            }
          : undefined;
      if (interruptedOutcome) run.outcomes.push(interruptedOutcome);
      try {
        const recorded = await readDiagnostics(journalPath);
        for (const diagnostic of recorded) {
          const outcome = run.outcomes.find(
            (item) => item.test === diagnostic.test,
          );
          (outcome?.diagnostics ?? run.diagnostics).push(diagnostic);
        }
      } catch (error) {
        run.diagnostics.push({
          test: "process",
          level: "error",
          count: 1,
          message: `Could not read diagnostic journal: ${String(error)}`,
        });
      } finally {
        await rm(directory, { recursive: true, force: true }).catch(() => {});
      }
      const processDiagnostics =
        interruptedOutcome?.diagnostics ?? run.diagnostics;
      if (!completed && !interrupted)
        processDiagnostics.push({
          test: activeTest,
          level: "error",
          count: 1,
          message: timedOut
            ? `${activeTest === "process" ? "Worker startup or transition" : `Test "${activeTest}"`} exceeded ${timeout / 1000}s timeout`
            : `Process exited (code ${code}, signal ${signal})`,
        });
      if (stdout)
        run.diagnostics.push({
          test: "process",
          level: "log",
          message: stdout,
          count: 1,
        });
      if (stderr)
        processDiagnostics.push({
          test: activeTest,
          level: "error",
          message: stderr,
          count: 1,
        });
      progress?.finish(framework, interruptedOutcome ? 1 : 0);
      resolveRun(run);
    });
  });
}

async function runFramework(
  framework: string,
  tests: string[],
  timeout: number,
): Promise<FrameworkRun> {
  const run: FrameworkRun = {
    framework,
    status: "completed",
    duration: 0,
    outcomes: [],
    diagnostics: [],
  };
  let remaining = tests;
  while (remaining.length && !interrupted) {
    const attempt = await runProcess(framework, remaining, timeout);
    run.outcomes.push(...attempt.outcomes);
    run.diagnostics.push(...attempt.diagnostics);
    run.duration += attempt.duration;
    if (attempt.status !== "completed") run.status = attempt.status;
    const attempted = new Set(attempt.outcomes.map((outcome) => outcome.test));
    remaining = remaining.filter((test) => !attempted.has(test));
    if (!attempted.size) break;
    if (remaining.length && !interrupted)
      progress?.log(
        `Restarting ${framework} after ${attempt.status} process · ${remaining.length} tests remaining`,
      );
  }
  if (interrupted) run.status = "interrupted";
  progress?.log(
    `Finished ${framework} · ${run.outcomes.length}/${tests.length} tests · ${run.status}`,
  );
  return run;
}

async function main() {
  const { values } = parseArgs({
    options: {
      ci: { type: "boolean" },
      mode: { type: "string" },
      profile: { type: "string" },
      "save-profile": { type: "string" },
      profiles: { type: "boolean" },
      baseline: { type: "string" },
      compare: { type: "string" },
      open: { type: "boolean" },
      detailed: { type: "boolean" },
      framework: { type: "string", multiple: true },
      test: { type: "string", multiple: true },
      jobs: { type: "string" },
      timeout: { type: "string" },
      output: { type: "string" },
      list: { type: "boolean" },
      all: { type: "boolean" },
      select: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(`pnpm bench [options]
  --select              Keyboard wizard: libraries, benchmarks, mode, review
  --framework <name>    Library name or fragment (repeatable; exact match preferred)
  --test <name>         Benchmark name or fragment (repeatable)
  --all                 Reset saved selection to the entire catalog
  --mode compare|quick  Sequential comparisons (default) or concurrent checks
  --jobs <count>        Override process count (default: 1, or CPU count in quick)
  --timeout <seconds>   Timeout per test including warmup (default: 60)
  --profile <name>      Load a saved profile
  --save-profile <name> Save this configuration as a profile
  --profiles            List saved profiles
  --ci                  Ignore local selection; never prompt
  --baseline <name>     Terminal/CSV/Markdown comparison baseline (default: fastest)
  --compare <path>      Compare with a previous report.json (or its directory)
  --detailed            Print per-test results in the terminal
  --output <path>       Report directory (default: results/<timestamp>)
  --open                Open the HTML report after saving
  --list                List libraries and benchmark descriptions
  --help, -h            Show usage

Interactive: arrows move, Space toggles, type to search, Enter continues,
Esc goes back; Ctrl+A/D/I select/clear/invert visible, Ctrl+G toggles a group.
Explicit flags are temporary unless --save-profile is supplied.`);
    return;
  }
  if (values.profiles) {
    const preferences = await readPreferences();
    console.log(
      Object.keys(preferences.profiles ?? {}).join("\n") ||
        "No saved profiles. Use --save-profile <name>.",
    );
    return;
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const available = await catalog();
  if (values.list) {
    console.log(
      "Libraries\n" +
        available.frameworks.join("\n") +
        "\n\nTests\n" +
        available.tests
          .map((test) => {
            const meta = available.metadata?.find((item) => item.name === test);
            return `${meta?.group ?? "Benchmark"} / ${test}${meta ? ` — ${meta.description} [${meta.aggregation}]` : ""}`;
          })
          .join("\n"),
    );
    return;
  }
  const chosen = await chooseRun(
    available,
    values,
    availableParallelism(),
    cancellation.signal,
  );
  const { tests, frameworks, jobs } = chosen;
  const timeout = chosen.timeout * 1000;
  if (interrupted) return;
  const baseline = values.baseline
    ? filterNames(frameworks, [values.baseline], "--baseline")
    : ["fastest"];
  if (baseline.length !== 1)
    throw new Error("--baseline must identify exactly one selected library");
  let previous: SharedReport | undefined;
  if (values.compare) {
    const path = resolve(values.compare);
    let contents: string;
    try {
      contents = await readFile(path, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EISDIR")
        contents = await readFile(resolve(path, "report.json"), "utf8");
      else throw error;
    }
    previous = parseReport(JSON.parse(contents));
  }
  const concurrency = Math.min(jobs, frameworks.length);
  const startedAt = new Date().toISOString();
  const output = resolve(
    values.output ?? `results/${startedAt.replace(/[:.]/g, "-")}`,
  );
  await mkdir(output, { recursive: true });
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const command = [
    "pnpm bench --ci",
    ...frameworks.flatMap((name) => ["--framework", quote(name)]),
    ...tests.flatMap((name) => ["--test", quote(name)]),
    "--mode",
    chosen.mode,
    "--jobs",
    String(jobs),
    "--timeout",
    String(chosen.timeout),
  ].join(" ");
  console.log(
    `Libraries: ${frameworks.join(", ")}\nOutput: ${output}\nReproduce: ${command}`,
  );
  const start = performance.now();
  progress = new Progress(frameworks.length * tests.length);
  const runs: FrameworkRun[] = [];
  const queue = [...frameworks];
  progress.log(
    `Running ${frameworks.length} libraries × ${tests.length} tests · ${concurrency} processes`,
  );
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length && !interrupted) {
        const framework = queue.shift();
        if (framework) runs.push(await runFramework(framework, tests, timeout));
      }
    }),
  );
  for (const framework of queue)
    runs.push({
      framework,
      status: "interrupted",
      duration: 0,
      outcomes: [],
      diagnostics: [],
    });
  runs.sort(
    (a, b) => frameworks.indexOf(a.framework) - frameworks.indexOf(b.framework),
  );
  progress.close();
  let commit: string | undefined;
  let dirty: boolean | undefined;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    dirty = Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {}
  const report: Report = {
    schemaVersion: 2,
    environment: "node",
    mode: concurrency > 1 ? "quick" : chosen.mode,
    timeout: chosen.timeout,
    gc: true,
    commit,
    dirty,
    command,
    versions: available.versions,
    metadata: available.metadata,
    startedAt,
    duration: performance.now() - start,
    concurrency,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    cpu: cpus()[0]?.model ?? "unknown",
    tests,
    runs,
  };
  await Promise.all([
    writeFile(
      resolve(output, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    ),
    writeFile(resolve(output, "results.csv"), renderCsv(report, baseline[0])),
    writeFile(resolve(output, "report.html"), renderHtml(report, previous)),
  ]);
  await writeFile(
    resolve(output, "comparison.md"),
    renderMarkdown(report, baseline[0]),
  );
  printReport(report, baseline[0], values.detailed, previous);
  console.log(`\nReports saved to ${output}`);
  console.log(`HTML report: ${resolve(output, "report.html")}`);
  if (values.open) {
    const path = resolve(output, "report.html");
    const opener =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer.exe"
          : "xdg-open";
    const child = spawn(opener, [path], { detached: true, stdio: "ignore" });
    child.on("error", (error) =>
      console.warn(`Could not open report: ${error.message}`),
    );
    child.unref();
  }
  if (interrupted) process.exitCode = 130;
  else if (
    runs.some(
      (run) =>
        run.status !== "completed" ||
        run.outcomes.length !== tests.length ||
        run.outcomes.some(
          (outcome) =>
            outcome.time === undefined ||
            outcome.diagnostics.some(
              (diagnostic) => diagnostic.level === "error",
            ),
        ) ||
        run.diagnostics.some((diagnostic) => diagnostic.level === "error"),
    )
  )
    process.exitCode = 1;
}

main().catch((error: unknown) => {
  for (const child of children) child.kill("SIGKILL");
  progress?.close();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode =
    interrupted ||
    (error instanceof Error && error.message === "Selection cancelled")
      ? 130
      : 1;
});
