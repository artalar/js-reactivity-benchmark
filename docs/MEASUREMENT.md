# Measurement and results

## Existing measurement methods

| Group   | Reported time                                                         |
| ------- | --------------------------------------------------------------------- |
| S       | Minimum of 10 repetitions for each subcase; subcase minima are summed |
| Kairo   | Minimum of 10 repetitions, each with 500 updates                      |
| CellX   | Sum of 10 repetitions                                                 |
| Dynamic | Minimum of 5 repetitions                                              |

Warmup and cleanup remain owned by the benchmark implementations. Node workers
run with `--expose-gc`; explicit collection occurs where the original benchmarks
request it. Browser workers use GC only when the runtime exposes it. The report
records whether GC is available.

Raw repetitions are stored in `samples`. S benchmarks store named subcases in
`measurements`; flattening their samples would mix distinct workloads. The
report shows minimum, median and maximum for each sample set. These values are
not confidence intervals. A fast minimum or a small percentage difference alone
does not establish a statistically significant improvement.

Compare mode uses one process/worker at a time. It reduces competition between
libraries in the same run but cannot eliminate operating system scheduling,
frequency scaling, thermal effects or other applications. Quick mode is intended
for rapid checks and explicitly labels concurrent measurements.

## Ratios and summaries

For valid times `current` and positive `baseline`:

```text
relative time = current / baseline
time change % = (current / baseline - 1) × 100
```

Thus `0.80×` means 20% less time and `1.20×` means 20% more time. Missing, failed
or zero baselines produce no ratio. Failed validation results can retain a raw
time for diagnosis, but they do not enter comparisons.

Group summaries use the geometric mean of per-test ratios, restricted to tests
where every visible library has a valid, positive time. This keeps coverage
consistent between libraries. The UI reports the shared coverage; filtering or
hiding a library changes the comparison set. A summary is not a universal measure
of library performance.

Historical comparisons match the same library and test. Node/runtime, platform,
CPU, concurrency, GC and benchmark metadata are checked. Legacy reports lack
some metadata and require review. Version changes are displayed but do not block
comparison. A modified working tree and local source imports are recorded so a
commit or npm version is not mistaken for the complete source used.

## Report schema

`Report`, `FrameworkRun`, `TestOutcome` and validation live in
`packages/core/src/results.ts`. New reports use schema version 2; the reader also
accepts the earlier schema and identifies its incomplete metadata.

A run records timestamps, elapsed time, environment, process count, timeout,
Git state, library versions, benchmark metadata and results. Each library records
its process status, wall time, outcomes and diagnostics. Each outcome records its
test name, optional time, optional samples/subcase measurements, optional failure
status and diagnostics.

`passed`, `failed`, `timeout`, `crash`, `interrupted` and `not run` are distinct
presentation statuses. An absent time is never represented as a fast zero.
Process status is separate: a restarted library may have completed later cases
while retaining a failed/timeout status from an earlier attempt.

Diagnostics retain level, message and occurrence count. Node workers journal them
synchronously so assertions survive crashes and hangs. Repeated messages are
grouped; each test retains up to 200 distinct messages plus overflow counts,
messages are limited to 8 KB, and direct process output is limited to 64 KB per
library. Browser workers apply the message cap in memory; a forcibly terminated
worker can lose diagnostics from its active test, while completed outcomes stay
in the page.

`Ctrl+C` and browser Stop preserve completed outcomes. Tests waiting in the queue
are marked interrupted. A Node crash or timeout restarts unattempted tests with a
fresh process and timeout. Startup failure without any attempted test stops that
library rather than retrying indefinitely.
