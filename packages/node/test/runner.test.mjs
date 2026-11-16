import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const worker = `
const [framework, encodedTests] = process.argv.slice(2);
const tests = ["before", "crash", "timeout", "after"];
const send = (message) => process.send(message);
if (framework === "--list") {
  send({ type: "catalog", frameworks: ["unstable", "healthy"], tests });
  process.disconnect();
} else {
  for (const test of JSON.parse(encodedTests)) {
    send({ type: "start", test });
    if (framework === "unstable" && test === "crash") {
      await new Promise((resolve) => process.send({ type: "diagnostics", diagnostics: [] }, resolve));
      process.exit(7);
    }
    if (framework === "unstable" && test === "timeout") {
      await new Promise(() => setInterval(() => {}, 1000));
    }
    send({ type: "outcome", outcome: { test, time: 1, diagnostics: [] } });
  }
  send({ type: "done" });
  process.disconnect();
}
`;

test(
  "continues remaining cases after crashes and timeouts while other libraries finish",
  { timeout: 15000 },
  async (context) => {
    const directory = await mkdtemp(join(tmpdir(), "reactivity-runner-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    await copyFile(
      new URL("../dist/index.mjs", import.meta.url),
      join(directory, "index.mjs"),
    );
    await writeFile(join(directory, "worker.mjs"), worker);
    const output = join(directory, "report");
    const child = spawn(
      process.execPath,
      [
        join(directory, "index.mjs"),
        "--jobs",
        "2",
        "--timeout",
        "1",
        "--output",
        output,
      ],
      { cwd: directory },
    );
    context.after(() => child.kill("SIGKILL"));
    let logs = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      logs += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      logs += chunk;
    });
    const exitCode = await new Promise((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", reject);
    });
    assert.equal(exitCode, 1, logs);
    const report = JSON.parse(
      await readFile(join(output, "report.json"), "utf8"),
    );
    const unstable = report.runs.find((run) => run.framework === "unstable");
    const healthy = report.runs.find((run) => run.framework === "healthy");
    assert.deepEqual(
      unstable.outcomes.map((outcome) => outcome.test),
      ["before", "crash", "timeout", "after"],
    );
    assert.equal(unstable.outcomes[0].time, 1);
    assert.match(unstable.outcomes[1].diagnostics[0].message, /code 7/);
    assert.match(unstable.outcomes[2].diagnostics[0].message, /timeout/);
    assert.equal(unstable.outcomes[3].time, 1);
    assert.equal(healthy.status, "completed");
    assert.equal(healthy.outcomes.length, 4);
    assert.ok(logs.includes("Restarting unstable"));
    const csv = await readFile(join(output, "results.csv"), "utf8");
    assert.ok(csv.includes('"unstable","crash","crash"'));
    assert.ok(csv.includes('"unstable","after","passed"'));
  },
);

test(
  "real worker preserves large results and diagnostics across crashes and synchronous hangs",
  { timeout: 15000 },
  async (context) => {
    const directory = await mkdtemp(join(tmpdir(), "reactivity-worker-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    await copyFile(
      new URL("../dist/index.mjs", import.meta.url),
      join(directory, "index.mjs"),
    );
    const fixturePath = join(directory, "fixture.mjs");
    await writeFile(
      fixturePath,
      `
    export const benchmarkCases = ["passed", "assert-crash", "assert-timeout", "after"].map((name) => ({name}));
    export const frameworkCatalog = [{ name: "fixture", load: async () => ({ name: "fixture" }) }];
    export async function runTests(infos, result, options) {
      for (const test of options.tests) {
        await options.onStart("fixture", test);
        if (test === "passed") {
          for (let i = 0; i < 200; i++) console.log(i + "x".repeat(7900));
        }
        if (test.startsWith("assert-")) {
          console.assert(false, "saved assertion");
          console.assert(false, "saved assertion");
          if (test === "assert-crash") process.exit(7);
          while (true) {}
        }
        result({framework: "fixture", test, time: 1});
      }
    }
  `,
    );
    await build({
      entryPoints: [
        fileURLToPath(new URL("../src/worker.ts", import.meta.url)),
      ],
      outfile: join(directory, "worker.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      plugins: [
        {
          name: "fixture-core",
          setup(builder) {
            builder.onResolve(
              {
                filter:
                  /^js-reactivity-benchmark\/src\/(runner|frameworkCatalog)$/,
              },
              () => ({ path: fixturePath }),
            );
          },
        },
      ],
    });
    const output = join(directory, "report");
    const child = spawn(
      process.execPath,
      [join(directory, "index.mjs"), "--timeout", "2", "--output", output],
      { cwd: directory },
    );
    context.after(() => child.kill("SIGKILL"));
    let logs = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      logs += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      logs += chunk;
    });
    const code = await new Promise((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", reject);
    });
    assert.equal(code, 1, logs);
    const report = JSON.parse(
      await readFile(join(output, "report.json"), "utf8"),
    );
    const [passed, crashed, timedOut, after] = report.runs[0].outcomes;
    assert.equal(passed.test, "passed");
    assert.equal(passed.time, 1);
    assert.equal(passed.diagnostics.length, 200);
    assert.equal(passed.diagnostics[199].message.length, 7903);
    for (const outcome of [crashed, timedOut]) {
      const assertion = outcome.diagnostics.find(
        (item) => item.message === "saved assertion",
      );
      assert.equal(assertion.count, 2);
    }
    assert.match(crashed.diagnostics.at(-1).message, /code 7/);
    assert.match(timedOut.diagnostics.at(-1).message, /timeout/);
    assert.equal(after.test, "after");
    assert.equal(after.time, 1);
  },
);

test(
  "explicit choices stay temporary; named profiles persist and CI ignores local selection",
  { timeout: 15000 },
  async (context) => {
    const directory = await mkdtemp(join(tmpdir(), "reactivity-selection-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    await copyFile(
      new URL("../dist/index.mjs", import.meta.url),
      join(directory, "index.mjs"),
    );
    await writeFile(join(directory, "worker.mjs"), worker);
    async function run(args = []) {
      const output = join(directory, "report");
      const child = spawn(
        process.execPath,
        [
          join(directory, "index.mjs"),
          "--test",
          "after",
          "--output",
          output,
          ...args,
        ],
        { cwd: directory },
      );
      context.after(() => child.kill("SIGKILL"));
      child.stdout.resume();
      child.stderr.resume();
      assert.equal(
        await new Promise((resolve, reject) => {
          child.on("close", resolve);
          child.on("error", reject);
        }),
        0,
      );
      return JSON.parse(await readFile(join(output, "report.json"), "utf8"));
    }
    assert.equal((await run()).runs.length, 2);
    assert.deepEqual(
      (await run(["--framework", "healthy"])).runs.map((run) => run.framework),
      ["healthy"],
    );
    assert.equal((await run()).runs.length, 2);
    await run(["--framework", "healthy", "--save-profile", "healthy-only"]);
    assert.deepEqual(
      (await run()).runs.map((item) => item.framework),
      ["healthy"],
    );
    assert.equal((await run(["--ci"])).runs.length, 2);
    assert.deepEqual(
      (await run(["--profile", "healthy-only"])).runs.map(
        (item) => item.framework,
      ),
      ["healthy"],
    );
    assert.equal((await run(["--all"])).runs.length, 2);
    const preferences = JSON.parse(
      await readFile(join(directory, ".benchmark-selection.json"), "utf8"),
    );
    assert.equal(preferences.frameworks, null);
  },
);

test(
  "resets the timeout for each test even when the library takes longer than the limit",
  { timeout: 10000 },
  async (context) => {
    const directory = await mkdtemp(
      join(tmpdir(), "reactivity-per-test-timeout-"),
    );
    context.after(() => rm(directory, { recursive: true, force: true }));
    await copyFile(
      new URL("../dist/index.mjs", import.meta.url),
      join(directory, "index.mjs"),
    );
    await writeFile(
      join(directory, "worker.mjs"),
      `
    import { once } from "node:events";
    import { setTimeout } from "node:timers/promises";
    const tests = ["first", "second", "third"];
    if (process.argv[2] === "--list") {
      process.send({ type: "catalog", frameworks: ["fixture"], tests });
    } else {
      for (const test of tests) {
        const ready = once(process, "message");
        process.send({ type: "start", test });
        await ready;
        await setTimeout(650);
        process.send({ type: "outcome", outcome: { test, time: 650, diagnostics: [] } });
      }
      process.send({ type: "done" });
    }
    process.disconnect();
  `,
    );
    const output = join(directory, "report");
    const child = spawn(
      process.execPath,
      [join(directory, "index.mjs"), "--timeout", "1", "--output", output],
      { cwd: directory },
    );
    context.after(() => child.kill("SIGKILL"));
    let logs = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      logs += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      logs += chunk;
    });
    const code = await new Promise((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", reject);
    });
    assert.equal(code, 0, logs);
    const report = JSON.parse(
      await readFile(join(output, "report.json"), "utf8"),
    );
    assert.equal(report.runs[0].status, "completed");
    assert.equal(report.runs[0].outcomes.length, 3);
    assert.ok(report.runs[0].duration > 1000);
    assert.ok(!logs.includes("Restarting"));
  },
);

test(
  "keyboard wizard supports search, toggling, arrows and going back",
  { timeout: 15000, skip: process.platform === "win32" },
  async (context) => {
    const directory = await mkdtemp(join(tmpdir(), "reactivity-keyboard-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const runner = join(directory, "index.mjs");
    await copyFile(new URL("../dist/index.mjs", import.meta.url), runner);
    await writeFile(join(directory, "worker.mjs"), worker);
    const child = spawn("python3", [
      fileURLToPath(new URL("./keyboard.py", import.meta.url)),
      process.execPath,
      runner,
      directory,
    ]);
    context.after(() => child.kill("SIGKILL"));
    let logs = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      logs += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      logs += chunk;
    });
    const code = await new Promise((resolve, reject) => {
      child.on("close", resolve);
      child.on("error", reject);
    });
    assert.equal(code, 0, logs);
  },
);
