import { perfTests } from "./config";
import type { TestMetadata } from "./results";

const descriptions: Record<string, string> = {
  createSignals: "Create mutable reactive sources.",
  createComputations:
    "Create computations with different fan-in and fan-out shapes.",
  updateSignals:
    "Propagate source updates through different dependency shapes.",
  avoidablePropagation:
    "Avoid downstream work when computed values stay unchanged.",
  broadPropagation: "Propagate changes across a wide dependency graph.",
  deepPropagation: "Propagate changes through a deep dependency chain.",
  diamond: "Update a diamond graph with shared dependencies.",
  mux: "Switch between reactive sources.",
  repeatedObservers: "Update sources with repeated observers.",
  triangle: "Update a triangle graph with overlapping dependencies.",
  unstable: "Rebuild dependencies as the graph changes.",
  molBench: "Run the mol reactive graph workload.",
};

export function benchmarkMetadata(name: string): TestMetadata {
  const group = name.startsWith("cellx")
    ? "CellX"
    : ["createSignals", "createComputations", "updateSignals"].includes(name)
      ? "S"
      : name in descriptions
        ? "Kairo"
        : "Dynamic";
  const config =
    group === "Dynamic"
      ? perfTests.find((config) => {
          const dynamic =
            config.staticFraction < 1
              ? ` - dyn${Math.round((1 - config.staticFraction) * 100)}%`
              : "";
          const lazy =
            config.readFraction < 1
              ? ` - lazy${Math.round((1 - config.readFraction) * 100)}%`
              : "";
          return (
            name ===
            `${config.nSources}-${config.width}x${config.totalLayers}${dynamic}${lazy}${config.name ? ` (${config.name})` : ""}`
          );
        })
      : undefined;
  const parameters: Record<string, number> | undefined = config
    ? {
        width: config.width,
        layers: config.totalLayers,
        sources: config.nSources,
        staticFraction: config.staticFraction,
        readFraction: config.readFraction,
        iterations: config.iterations,
      }
    : group === "CellX"
      ? { layers: Number(name.slice(5)) }
      : undefined;
  return {
    id: `${group.toLowerCase()}:${name}`,
    name,
    group,
    description:
      descriptions[name] ??
      (group === "CellX"
        ? `Propagate updates through ${name.slice(5)} layers of cells.`
        : "Update a configurable graph with dynamic dependencies and partial reads."),
    aggregation:
      group === "CellX"
        ? "Sum of 10 repetitions"
        : group === "S"
          ? "Minimum of 10 repetitions per subcase; subcase times summed"
          : group === "Kairo"
            ? "Minimum of 10 repetitions × 500 updates"
            : "Minimum of 5 repetitions",
    parameters,
  };
}
