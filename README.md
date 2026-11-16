# JS Reactivity Benchmark

Compare JavaScript reactivity libraries across source creation, propagation,
CellX graphs and configurable dynamic dependency graphs.

Requires Node.js 24+ and pnpm 10. Reatom uses the published `@reatom/core`
package from npm. See [Reatom notes](docs/REATOM.md) for adapter lifecycle and
profiling details.

```sh
pnpm install
pnpm bench
```

In a terminal, the command opens a keyboard wizard: choose libraries, choose
benchmarks, select a measurement mode, then review and start. The previous
selection is restored. Reports are saved even when individual tests fail.

| Key                      | Action                                                       |
| ------------------------ | ------------------------------------------------------------ |
| ↑ / ↓, Home / End        | Move through choices                                         |
| Space                    | Toggle a checkbox                                            |
| Type / Backspace         | Search / edit search                                         |
| Ctrl+A / Ctrl+D / Ctrl+I | Select / clear / invert visible matches                      |
| Ctrl+G                   | Toggle the focused benchmark group within visible matches    |
| Enter                    | Continue or choose an action                                 |
| Esc                      | Go back; cancel from the first step                          |
| Ctrl+C                   | Cancel selection, or stop execution and save partial results |

Hidden matches keep their selection. An empty selection cannot be submitted.
No mouse is needed.

## Run from the command line

```sh
pnpm bench --list
pnpm bench --framework reatom --framework alien --test diamond
pnpm bench --mode quick --jobs 2 --timeout 60
pnpm bench --framework alien --test diamond --save-profile propagation
pnpm bench --profile propagation --open
pnpm bench --profiles
pnpm bench --ci --framework alien --test diamond
pnpm bench --baseline alien --compare results/previous-run --detailed
pnpm bench --help
```

Library and test filters accept case-insensitive fragments, prefer exact matches,
and can be repeated. Every run prints a command that reproduces its selection and
measurement settings. `pnpm run run` remains an alias for `pnpm bench`.

**Compare mode is the default:** one library process at a time, with independent
warmup. **Quick mode** runs libraries concurrently, up to the available CPU count;
use it to check correctness quickly. Processes share CPU and memory, so timings
from quick mode should be interpreted accordingly. `--jobs 2` implies quick mode
unless a mode is explicit. Explicit compare mode requires one job.

The timeout applies to each test, including warmup, and to worker startup or
transitions. A crash or timeout preserves completed results and restarts the
remaining tests in a fresh process. Validation failures and exceptions are
attributed to the individual test. Failed tests, crashes and timeouts produce a
nonzero exit code; interruption produces exit code 130.

### Saved selection and profiles

Interactive selections are saved in `.benchmark-selection.json`, ignored by Git.
They include libraries, benchmarks, mode, jobs and timeout. `--save-profile NAME`
saves a named configuration; `--profile NAME` loads one. `--all` resets the last
selection to the entire catalog and preserves named profiles.

Explicit flags are temporary unless `--save-profile` is supplied. This differs
from the earlier runner, where `--framework` automatically changed preferences.
Noninteractive runs can reuse the last local selection. Use `--ci` to ignore
local preferences and never prompt; combine it with explicit filters for a
repeatable CI subset. Without filters, `--ci` selects the entire catalog.

Removed saved entries are reported and omitted. If none remain, the runner
reports the problem and restores the full catalog. A malformed preferences file
has a recovery message; `--all` resets it and `--ci` ignores it.

## Read and share results

Each run creates `results/<timestamp>/` (override with `--output PATH`):

| File            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `report.html`   | Standalone interactive report, opens directly without a server |
| `report.json`   | Results, individual measurements, diagnostics and run metadata |
| `results.csv`   | Every library/test pair, status, timing and relative values    |
| `comparison.md` | Table ready to paste into an issue or pull request             |

The HTML report includes sorted bar charts, a matrix with a color scale, group
summaries, library visibility controls, baseline selection, time/ratio/percentage
views, diagnostics, measurement spread and metadata. Filters work with both
charts and the matrix. Every control is keyboard accessible; a light theme is
available. Exports from the HTML report reflect visible filters, except JSON,
which retains the full run.

A ratio of **1.20× means 20% more time** than the baseline. Lower time is better.
Each test has its own bar scale. Failed or missing results are excluded from
numerical comparisons. Group summaries use geometric means of ratios over a
shared set of valid, positive timings and show their coverage. Sample statistics
describe individual repetitions; they do not replace the benchmark's aggregation.

Load a previous `report.json` in the report, or pass `--compare PATH` to the CLI.
The report checks the environment and measurement metadata before displaying
historical percentages. Incompatible and legacy reports require an explicit
acknowledgment in the HTML report. Version changes are retained for inspection;
comparing library versions is an intended workflow.

## Browser benchmarks

```sh
pnpm dev
```

Open the URL printed by Vite. Choose libraries and benchmarks, filter the lists,
select groups, and run. Each library runs in a separate Web Worker so the page
remains responsive. Stop keeps completed results; crashes and timeouts allow
remaining tests to continue in a fresh worker. Browser profiles are stored in
local storage separately from CLI profiles. Save the HTML report to keep and
share results. Browser and Node results carry different environment metadata.

## Development

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

`pnpm test` runs both core and Node suites even when one fails. The terminal
keyboard regression test uses Python 3 and a pseudo terminal on Unix; it is
skipped on Windows. Adapter correctness tests can expose semantic differences in
libraries independently of runner and report tests.

- [Adding a library or benchmark](docs/CONTRIBUTING.md)
- [Measurement methods and result format](docs/MEASUREMENT.md)
- [Historical published results](docs/legacy-results.md)

These microbenchmarks measure specific graph workloads. Typical applications
also perform rendering, I/O and other work; interpret results in that context.
