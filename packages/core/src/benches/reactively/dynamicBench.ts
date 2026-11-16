import { makeGraph, runGraph } from "./dependencyGraph";
import { verifyBenchResult } from "../../util/perfTests";
import { FrameworkInfo, TestConfig } from "../../util/frameworkTypes";
import { perfTests } from "../../config";
import { fastestTest } from "../../util/benchRepeat";
import { PerfResultCallback } from "../../util/perfLogging";
import { collectGarbage, nextTick } from "../../util/asyncUtil";

function percent(n: number): string {
  return Math.round(n * 100) + "%";
}

export function makeTitle(config: TestConfig): string {
  const { width, totalLayers, staticFraction, nSources, readFraction } = config;
  const dyn = staticFraction < 1 ? " - dyn" + percent(1 - staticFraction) : "";
  const read = readFraction < 1 ? ` - lazy${percent(1 - readFraction)}` : "";
  return `${nSources}-${width}x${totalLayers}${dyn}${read}`;
}

/** benchmark a single test under single framework.
 * The test is run multiple times and the fastest result is logged to the console.
 */
export async function dynamicBench(
  frameworkInfo: FrameworkInfo[],
  logPerfResult: PerfResultCallback,
  testRepeats = 5,
  configs = perfTests,
): Promise<void> {
  for (const config of configs) {
    for (const frameworkTest of frameworkInfo) {
      const { framework } = frameworkTest;
      const { iterations, readFraction } = config;

      const { graph, counter } = makeGraph(framework, readFraction, config);

      function runOnce(): number {
        return runGraph(graph, iterations, framework);
      }

      // warm up
      runOnce();
      runOnce();

      await nextTick();
      runOnce();

      const timedResult = await fastestTest(testRepeats, () => {
        counter.count = 0;
        const sum = runOnce();
        return { sum, count: counter.count };
      });

      framework.cleanup();
      collectGarbage();

      logPerfResult({
        framework: framework.name,
        test: makeTitle(config) + (config.name ? ` (${config.name})` : ""),
        time: timedResult.time,
        samples: timedResult.samples,
      });
      verifyBenchResult(frameworkTest, config, timedResult);
    }
  }
}
