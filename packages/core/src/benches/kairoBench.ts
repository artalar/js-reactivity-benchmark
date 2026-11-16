import { avoidablePropagation } from "./kairo/avoidable";
import { broadPropagation } from "./kairo/broad";
import { deepPropagation } from "./kairo/deep";
import { diamond } from "./kairo/diamond";
import { mux } from "./kairo/mux";
import { repeatedObservers } from "./kairo/repeated";
import { triangle } from "./kairo/triangle";
import { unstable } from "./kairo/unstable";
import { collectGarbage, nextTick } from "../util/asyncUtil";
import { fastestTest } from "../util/benchRepeat";
import { PerfResultCallback } from "../util/perfLogging";
import { FrameworkInfo } from "../util/frameworkTypes";
import { mol } from "./kairo/molBench";

export const kairoCases = [
  { name: "avoidablePropagation", fn: avoidablePropagation },
  { name: "broadPropagation", fn: broadPropagation },
  { name: "deepPropagation", fn: deepPropagation },
  { name: "diamond", fn: diamond },
  { name: "mux", fn: mux },
  { name: "repeatedObservers", fn: repeatedObservers },
  { name: "triangle", fn: triangle },
  { name: "unstable", fn: unstable },
  { name: "molBench", fn: mol },
];

export async function kairoBench(
  frameworkInfo: FrameworkInfo[],
  logPerfResult: PerfResultCallback,
  cases = kairoCases,
) {
  // warmup
  for (const c of cases) {
    for (const { framework } of frameworkInfo) {
      const iter = framework.withBuild(() => c.fn(framework));

      iter();
      iter();

      await nextTick();
      iter();

      framework.cleanup();
    }
  }

  collectGarbage();
  await nextTick();

  // actual benchmark
  for (const c of cases) {
    for (const { framework } of frameworkInfo) {
      const iter = framework.withBuild(() => {
        const iter = c.fn(framework);
        return iter;
      });

      iter();
      iter();
      await nextTick();

      iter();
      await nextTick();

      const { time, samples } = await fastestTest(10, () => {
        for (let i = 0; i < 500; i++) {
          iter();
        }
      });

      framework.cleanup();
      collectGarbage();

      logPerfResult({
        framework: framework.name,
        test: c.name,
        time,
        samples,
      });
    }
  }
}
