import { afterEach, expect, test, vi } from "vitest";
import {
  benchmarkCases,
  runTests,
  type BenchmarkCase,
  type FrameworkInfo,
} from "./runner";

const originalCases = [...benchmarkCases];

afterEach(() => {
  benchmarkCases.splice(0, benchmarkCases.length, ...originalCases);
});

function setup(cases: BenchmarkCase[]) {
  benchmarkCases.splice(0, benchmarkCases.length, ...cases);
  const cleanup = vi.fn();
  const info: FrameworkInfo = {
    framework: {
      name: "fixture",
      signal: (value) => ({ read: () => value, write: () => {} }),
      computed: (fn) => ({ read: fn }),
      effect: (fn) => {
        fn();
      },
      withBatch: (fn) => {
        fn();
      },
      withBuild: (fn) => fn(),
      cleanup,
    },
  };
  return { info, cleanup };
}

test("records an exception, cleans up and continues with the next case", async () => {
  const error = new Error("test failure");
  const next = vi.fn(async () => {});
  const { info, cleanup } = setup([
    {
      name: "failure",
      run: async () => {
        throw error;
      },
    },
    { name: "next", run: next },
  ]);
  const onError = vi.fn();
  const onStart = vi.fn();
  await runTests([info], vi.fn(), { onError, onStart });
  expect(onError).toHaveBeenCalledExactlyOnceWith(error, "fixture", "failure");
  expect(cleanup).toHaveBeenCalledOnce();
  expect(next).toHaveBeenCalledOnce();
  expect(onStart.mock.calls).toEqual([
    ["fixture", "failure"],
    ["fixture", "next"],
  ]);
});

test("preserves cleanup ownership for successful benchmarks", async () => {
  const { info, cleanup } = setup([
    {
      name: "success",
      run: async (entry) => {
        entry.framework.cleanup();
      },
    },
  ]);
  await runTests([info], vi.fn());
  expect(cleanup).toHaveBeenCalledOnce();
});

test("reports cleanup failures and continues", async () => {
  const failure = new Error("test failure");
  const cleanupFailure = new Error("cleanup failure");
  const next = vi.fn(async () => {});
  const { info, cleanup } = setup([
    {
      name: "failure",
      run: async () => {
        throw failure;
      },
    },
    { name: "next", run: next },
  ]);
  cleanup.mockImplementation(() => {
    throw cleanupFailure;
  });
  const onError = vi.fn();
  await runTests([info], vi.fn(), { onError });
  expect(onError.mock.calls).toEqual([
    [cleanupFailure, "fixture", "failure"],
    [failure, "fixture", "failure"],
  ]);
  expect(next).toHaveBeenCalledOnce();
});

test("propagates errors to callers without an error handler", async () => {
  const failure = new Error("test failure");
  const { info, cleanup } = setup([
    {
      name: "failure",
      run: async () => {
        throw failure;
      },
    },
  ]);
  await expect(runTests([info], vi.fn())).rejects.toThrow(failure);
  expect(cleanup).toHaveBeenCalledOnce();
});

test("runs only selected cases", async () => {
  const skip = vi.fn(async () => {});
  const run = vi.fn(async () => {});
  const { info } = setup([
    { name: "skip", run: skip },
    { name: "selected", run },
  ]);
  await runTests([info], vi.fn(), { tests: ["selected"] });
  expect(skip).not.toHaveBeenCalled();
  expect(run).toHaveBeenCalledOnce();
});

test("waits for an asynchronous start hook before executing the case", async () => {
  const events: string[] = [];
  const { info } = setup([
    {
      name: "selected",
      run: async () => {
        events.push("run");
      },
    },
  ]);
  await runTests([info], vi.fn(), {
    onStart: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push("ready");
    },
  });
  expect(events).toEqual(["ready", "run"]);
});
