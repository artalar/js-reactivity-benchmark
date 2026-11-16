# Contributing

The workspace has three packages: `core` owns adapters, benchmark cases, result
analysis and the report UI; `node` owns isolated processes, terminal interaction
and disk exports; `web` owns browser selection and Web Workers.

## Add a library

1. Add the dependency to `packages/core/package.json` with pnpm.
2. Implement `ReactiveFramework` in `packages/core/src/frameworks/`.
3. Add one entry to `frameworkCatalog.ts`: stable ID, display name, package,
   adapter source path, lazy loader and pull-count capability.
4. Run adapter correctness tests and selected real benchmarks, including a graph
   with dynamic dependencies and cleanup. `testPullCounts` controls partial-read
   count validation; it must reflect the adapter's actual semantics.

The catalog drives CLI selection, browser selection and the compatibility
`frameworkInfo` export. Avoid adding another separate library list. Keep IDs
stable if display labels change. Files under `frameworks/inactive/` remain in
that directory for historical reasons; catalog entries determine availability.

A library may use a local checkout. Version metadata labels adapter imports
that traverse three or more parent directories as local sources, rather than
claiming the installed npm version measured that code. Inspect provenance when
sharing results.

## Add a benchmark

1. Implement the scenario and register it in `runner.ts`.
2. Supply metadata in `benchmarkMetadata.ts`: group, description, parameters,
   stable ID and aggregation method. Dynamic cases derive their metadata from
   `config.ts`; keep their naming consistent with `makeTitle`.
3. Preserve cleanup ownership, validation and warmup behavior. Emit one
   `PerfResult` per selected library/case, including raw samples where available.
4. Verify that CLI filtering and browser selection can run the case alone.

Do not silently change repetitions, warmup, validation or aggregation while
changing presentation. A measurement method change requires corresponding
metadata so historical reports can detect the difference.

## Checks

- `pnpm typecheck` checks all three packages.
- `pnpm test` runs result analysis, report DOM/standalone HTML, runner recovery,
  profiles, keyboard interaction and adapter correctness tests.
- `pnpm build` builds core, Node and browser artifacts.
- `pnpm format:check` checks repository formatting; `pnpm format` rewrites it.

Runner integration tests use synthetic workers, so crash, timeout and restart
coverage does not depend on the speed of the developer's machine. Report tests
use Happy DOM and execute the generated inline script to catch accidental
runtime imports or missing closures in standalone HTML.
