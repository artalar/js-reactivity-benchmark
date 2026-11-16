import { afterEach, describe, expect, test, vi } from "vitest";
import { atom, context } from "@reatom/core";
import { reatomFramework as framework } from "./frameworks/reatom";
import { kairoCases } from "./benches/kairoBench";

// Exercise the default context too: upstream's test helper always starts a new
// context, which hides initialization failures in the default queue callback.
afterEach(() => {
  framework.cleanup();
  vi.restoreAllMocks();
});

test("default-context notifications work after a microtask", async () => {
  const source = atom(0);
  const values: number[] = [];
  const stop = source.subscribe((value) => values.push(value));
  source.set(1);
  await Promise.resolve();
  expect(values).toEqual([0, 1]);
  stop();
});

test("build preserves state and subscriptions across ticks", async () => {
  const values: number[] = [];
  const source = framework.withBuild(() => {
    const source = framework.signal(0);
    framework.effect(() => {
      values.push(source.read());
    });
    source.write(1);
    return source;
  });
  expect(source.read()).toBe(1);
  await Promise.resolve();
  source.write(2);
  expect(values).toEqual([0, 1, 2]);
});

test("nested batches deliver only the final value synchronously", () => {
  const source = framework.signal(0);
  const values: number[] = [];
  framework.effect(() => {
    values.push(source.read());
  });
  framework.withBatch(() => {
    source.write(1);
    framework.withBatch(() => source.write(2));
    expect(values).toEqual([0]);
    source.write(3);
  });
  expect(values).toEqual([0, 3]);
});

test("cleanup disconnects effects from their original context", async () => {
  const oldRoot = context();
  const source = framework.signal(0);
  const effect = vi.fn(() => source.read());
  framework.effect(effect);
  framework.cleanup();
  oldRoot.run(() => source.write(1));
  await Promise.resolve();
  expect(effect).toHaveBeenCalledTimes(1);
});

describe("Kairo correctness with assertions that fail the test", () => {
  test.each(kairoCases)("$name", async ({ fn }) => {
    vi.spyOn(console, "assert").mockImplementation((condition, ...message) => {
      expect(Boolean(condition), message.join(" ")).toBe(true);
    });
    const run = framework.withBuild(() => fn(framework));
    run();
    await Promise.resolve();
    run();
  });
});
