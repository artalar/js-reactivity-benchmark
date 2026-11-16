import { strict as assert } from "node:assert";
import { reatomFramework } from "../../core/src/frameworks/reatom";
import {
  makeGraph,
  runGraph,
} from "../../core/src/benches/reactively/dependencyGraph";
import { perfTests } from "../../core/src/config";

const index = Number(process.argv[2] ?? 0);
const config = perfTests[index];
assert(config, "Pass a dynamic graph index from 0 to 5");
const startBuild = performance.now();
const { graph, counter } = makeGraph(
  reatomFramework,
  config.readFraction,
  config,
);
const buildMs = performance.now() - startBuild;
runGraph(graph, config.iterations, reatomFramework);
await new Promise((resolve) => setTimeout(resolve, 0));
globalThis.gc?.();
const before = process.memoryUsage().heapUsed;
counter.count = 0;
const start = performance.now();
const sum = runGraph(graph, config.iterations, reatomFramework);
const runMs = performance.now() - start;
assert.equal(sum, config.expected.sum);
assert.equal(counter.count, config.expected.count);
reatomFramework.cleanup();
await new Promise((resolve) => setTimeout(resolve, 0));
globalThis.gc?.();
console.log(
  JSON.stringify(
    {
      index,
      buildMs,
      runMs,
      sum,
      count: counter.count,
      heapBeforeMB: before / 2 ** 20,
      heapAfterMB: process.memoryUsage().heapUsed / 2 ** 20,
      maxRssMB: process.resourceUsage().maxRSS / 1024,
    },
    null,
    2,
  ),
);
