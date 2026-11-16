import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { TestMetadata } from "js-reactivity-benchmark/src/results";
import { picker } from "./picker";

export interface Selection {
  frameworks: string[] | null;
  tests?: string[] | null;
  mode?: "compare" | "quick";
  jobs?: number;
  timeout?: number;
}
interface Preferences extends Selection {
  profiles?: Record<string, Selection>;
}
export interface SelectionOptions {
  framework?: string[];
  test?: string[];
  all?: boolean;
  select?: boolean;
  ci?: boolean;
  profile?: string;
  "save-profile"?: string;
  mode?: string;
  jobs?: string;
  timeout?: string;
}

export function filterNames(
  names: string[],
  filters: string[] | undefined,
  flag: string,
): string[] {
  if (!filters?.length) return names;
  const selected = new Set<string>();
  for (const filter of filters) {
    const exact = names.find(
      (name) => name.toLowerCase() === filter.toLowerCase(),
    );
    const matches = exact
      ? [exact]
      : names.filter((name) =>
          name.toLowerCase().includes(filter.toLowerCase()),
        );
    if (!matches.length)
      throw new Error(
        `${flag} matched nothing: ${filter}. Available: ${names.join(", ")}`,
      );
    matches.forEach((name) => selected.add(name));
  }
  return names.filter((name) => selected.has(name));
}

function isSelection(value: unknown): value is Selection {
  if (typeof value !== "object" || value === null || !("frameworks" in value))
    return false;
  const names = (names: unknown) =>
    names === null ||
    (Array.isArray(names) && names.every((name) => typeof name === "string"));
  return (
    names(value.frameworks) &&
    (!("tests" in value) || names(value.tests)) &&
    (!("mode" in value) ||
      value.mode === "compare" ||
      value.mode === "quick") &&
    ["jobs", "timeout"].every(
      (key) =>
        !(key in value) ||
        (typeof Reflect.get(value, key) === "number" &&
          Number.isSafeInteger(Reflect.get(value, key)) &&
          Reflect.get(value, key) > 0),
    )
  );
}

export async function readPreferences(): Promise<Preferences> {
  try {
    const value: unknown = JSON.parse(
      await readFile(resolve(".benchmark-selection.json"), "utf8"),
    );
    if (!isSelection(value)) throw new Error("Invalid selection format");
    const profiles: Record<string, Selection> = Object.create(null);
    if ("profiles" in value && value.profiles !== undefined) {
      if (typeof value.profiles !== "object" || value.profiles === null)
        throw new Error("Invalid profiles");
      for (const [name, profile] of Object.entries(value.profiles)) {
        if (!isSelection(profile)) throw new Error(`Invalid profile: ${name}`);
        profiles[name] = profile;
      }
    }
    return { ...value, profiles };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { frameworks: null, profiles: {} };
    throw new Error(
      `Cannot read .benchmark-selection.json: ${String(error)}. Use --all to reset or --ci to ignore local preferences.`,
    );
  }
}

async function savePreferences(
  selection: Selection,
  profiles: Record<string, Selection>,
) {
  const path = resolve(".benchmark-selection.json");
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(
      temporary,
      JSON.stringify({ ...selection, profiles }, null, 2) + "\n",
    );
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function positiveInteger(
  value: string | number | undefined,
  fallback: number,
  flag: string,
) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error(`${flag} requires a positive integer`);
  return number;
}

export async function chooseRun(
  available: {
    frameworks: string[];
    tests: string[];
    metadata?: TestMetadata[];
  },
  options: SelectionOptions,
  parallelism: number,
  signal?: AbortSignal,
) {
  if (options.all && (options.framework?.length || options.profile))
    throw new Error("Use --all without --framework or --profile");
  if (options.ci && options.select)
    throw new Error("--ci cannot be combined with --select");
  if (options.ci && options["save-profile"])
    throw new Error(
      "--ci does not write profiles. Save profiles in a local run instead.",
    );
  const preferences = options.ci
    ? { frameworks: null, profiles: {} }
    : await readPreferences().catch((error: unknown) => {
        if (options.all) {
          console.warn("Resetting unreadable local preferences.");
          return { frameworks: null, profiles: {} };
        }
        throw error;
      });
  const saved = options.profile
    ? Object.hasOwn(preferences.profiles ?? {}, options.profile)
      ? preferences.profiles?.[options.profile]
      : undefined
    : preferences;
  if (!saved)
    throw new Error(
      `Unknown profile: ${options.profile}. Use --profiles to list profiles.`,
    );
  const explicit = !!(
    options.all ||
    options.framework?.length ||
    options.test?.length ||
    options.profile ||
    options.mode ||
    options.jobs ||
    options.timeout
  );
  const useSaved = !options.ci && !options.all;
  const restore = (
    names: string[],
    remembered: string[] | null | undefined,
  ) => {
    if (!remembered) return names;
    const kept = names.filter((name) => remembered.includes(name));
    const missing = remembered.filter((name) => !names.includes(name));
    if (missing.length)
      console.warn(`Unavailable saved entries omitted: ${missing.join(", ")}`);
    if (!kept.length) {
      console.warn("Saved selection is unavailable; showing the full catalog.");
      return names;
    }
    return kept;
  };
  let frameworks = options.framework
    ? filterNames(available.frameworks, options.framework, "--framework")
    : restore(available.frameworks, useSaved ? saved.frameworks : null);
  let tests = options.test
    ? filterNames(available.tests, options.test, "--test")
    : restore(available.tests, useSaved ? saved.tests : null);
  let mode = options.mode ?? (useSaved ? saved.mode : undefined) ?? "compare";
  if (mode !== "compare" && mode !== "quick")
    throw new Error("--mode must be compare or quick");
  const savedJobs =
    useSaved && (!options.mode || options.mode === saved.mode)
      ? saved.jobs
      : undefined;
  const jobsExplicit = options.jobs !== undefined || savedJobs !== undefined;
  const timeout = positiveInteger(
    options.timeout ?? (useSaved ? saved.timeout : undefined),
    60,
    "--timeout",
  );
  if (timeout > 2147483)
    throw new Error("--timeout must be at most 2147483 seconds");
  let jobs = positiveInteger(
    options.jobs ?? savedJobs,
    mode === "quick" ? parallelism : 1,
    "--jobs",
  );
  if (!options.mode && jobs > 1) mode = "quick";
  if (options.mode === "compare" && jobs > 1)
    throw new Error(
      "Compare mode requires --jobs 1. Use --mode quick for concurrent processes.",
    );
  const interactive =
    !options.ci &&
    (options.select ||
      (process.stdin.isTTY && process.stdout.isTTY && !explicit));
  if (interactive) {
    let step = 0;
    while (step < 4) {
      if (step === 0) {
        const answer = await picker(
          "1 / 4 · Choose libraries",
          available.frameworks.map((name) => ({ name })),
          frameworks,
          signal,
        );
        if (!answer) throw new Error("Selection cancelled");
        frameworks = answer;
        step++;
      } else if (step === 1) {
        const answer = await picker(
          "2 / 4 · Choose benchmarks",
          available.tests.map((name) => ({
            name,
            ...available.metadata?.find((item) => item.name === name),
          })),
          tests,
          signal,
        );
        if (!answer) {
          step--;
          continue;
        }
        tests = answer;
        step++;
      } else if (step === 2) {
        const answer = await picker(
          "3 / 4 · Measurement mode",
          [
            {
              name: "compare",
              description:
                "Sequential isolated processes for timing comparisons.",
            },
            {
              name: "quick",
              description:
                "Concurrent library processes for a quick correctness check; CPU and memory are shared.",
            },
          ],
          [mode],
          signal,
          true,
        );
        if (!answer) {
          step--;
          continue;
        }
        const previousMode = mode;
        mode = answer[0];
        if (mode === "compare") jobs = 1;
        else if (mode !== previousMode && !options.jobs) jobs = parallelism;
        else if (!jobsExplicit) jobs = parallelism;
        step++;
      } else {
        const answer = await picker(
          `4 / 4 · ${frameworks.length} libraries × ${tests.length} tests · ${Math.min(jobs, frameworks.length)} jobs · ${timeout}s/test`,
          [
            {
              name: "Run benchmarks",
              description: `Libraries: ${frameworks.join(", ")}`,
            },
            { name: "Back to selection" },
            { name: "Cancel" },
          ],
          [],
          signal,
          true,
        );
        if (!answer) {
          step--;
          continue;
        }
        if (answer[0] === "Cancel") throw new Error("Selection cancelled");
        if (answer[0] === "Back to selection") {
          step = 0;
          continue;
        }
        step++;
      }
    }
  }
  const selection: Selection = {
    frameworks:
      frameworks.length === available.frameworks.length ? null : frameworks,
    tests: tests.length === available.tests.length ? null : tests,
    mode: mode === "quick" ? "quick" : "compare",
    jobs,
    timeout,
  };
  if (interactive || options.all || options["save-profile"]) {
    const profiles = { ...preferences.profiles };
    if (options["save-profile"]) {
      if (!/^[\w.-]{1,64}$/.test(options["save-profile"]))
        throw new Error(
          "Profile names use 1–64 letters, digits, dots, underscores or hyphens",
        );
      Object.defineProperty(profiles, options["save-profile"], {
        value: selection,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    await savePreferences(selection, profiles);
  }
  return { frameworks, tests, mode: selection.mode!, jobs, timeout };
}
