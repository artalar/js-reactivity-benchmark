import { dynamicBench, makeTitle } from "./benches/reactively/dynamicBench";
import { cellxbench } from "./benches/cellxBench";
import { sbench } from "./benches/sBench";
import { kairoBench, kairoCases } from "./benches/kairoBench";
import { perfTests } from "./config";
import type { FrameworkInfo } from "./util/frameworkTypes";
import { PerfResultCallback } from "./util/perfLogging";

export type { ReactiveFramework } from "./util/reactiveFramework";
export {
  perfResultHeaders,
  formatPerfResult,
  type PerfResult,
  type PerfResultStrings,
  type PerfResultCallback,
} from "./util/perfLogging";
export type { FrameworkInfo };

export interface BenchmarkCase {
  name: string;
  run: (framework: FrameworkInfo, result: PerfResultCallback) => Promise<void>;
}

export const benchmarkCases: BenchmarkCase[] = [
  ...["createSignals", "createComputations", "updateSignals"].map((name) => ({
    name,
    run: (info: FrameworkInfo, result: PerfResultCallback) =>
      sbench(info.framework, result, name),
  })),
  ...kairoCases.map((test) => ({
    name: test.name,
    run: (info: FrameworkInfo, result: PerfResultCallback) =>
      kairoBench([info], result, [test]),
  })),
  ...[1000, 2500].map((layers) => ({
    name: `cellx${layers}`,
    run: (info: FrameworkInfo, result: PerfResultCallback) =>
      cellxbench([info], result, [layers]),
  })),
  ...perfTests.map((config) => ({
    name: makeTitle(config) + (config.name ? ` (${config.name})` : ""),
    run: (info: FrameworkInfo, result: PerfResultCallback) =>
      dynamicBench([info], result, 5, [config]),
  })),
];

export interface RunOptions {
  tests?: string[];
  onStart?: (framework: string, test: string) => void | Promise<void>;
  onError?: (error: unknown, framework: string, test: string) => void;
}

export async function runTests(
  frameworkInfo: FrameworkInfo[],
  logPerfResult: PerfResultCallback,
  options: RunOptions = {},
) {
  for (const info of frameworkInfo) {
    for (const test of benchmarkCases) {
      if (options.tests && !options.tests.includes(test.name)) continue;
      await options.onStart?.(info.framework.name, test.name);
      try {
        await test.run(info, logPerfResult);
      } catch (error) {
        try {
          info.framework.cleanup();
        } catch (cleanupError) {
          if (options.onError)
            options.onError(cleanupError, info.framework.name, test.name);
        }
        if (!options.onError) throw error;
        options.onError(error, info.framework.name, test.name);
      }
    }
  }
}
