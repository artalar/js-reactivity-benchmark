import { dynamicBench } from "./dynamicBench";
// import { cellxbench } from "./cellxBench";
import { sbench } from "./sBench";
import { frameworkInfo } from "./config";
import { logPerfResult, perfReportHeaders } from "./util/perfLogging";
import { molBench } from "./molBench";
import { kairoBench } from "./kairoBench";
import { FrameworkInfo } from "./util/frameworkTypes";

async function main() {
  logPerfResult(perfReportHeaders());
  (globalThis as any).__DEV__ = true;

  for (const bench of [
    ({ framework }: FrameworkInfo) => kairoBench(framework),
    ({ framework }: FrameworkInfo) => molBench(framework),
    ({ framework }: FrameworkInfo) => sbench(framework),
    dynamicBench,
    // MobX, Valtio, and Svelte fail this test currently, so disabling it for now.
    // @see https://github.com/mobxjs/mobx/issues/3926
    // @see https://github.com/sveltejs/svelte/discussions/13277
    // cellxbench
  ]) {
    for (const frameworkTest of frameworkInfo) {
      await bench(frameworkTest);

      globalThis.gc?.();
    }
    console.log('\n')
  }
}

main();
