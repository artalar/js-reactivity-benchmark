# Reatom adapter notes

The benchmark imports the published `@reatom/core` npm package. It does not
include a local core fork or patches to the library.

Build and execution share the same context. Cleanup unsubscribes effects in
reverse creation order and flushes queued work. Resetting the context during
construction discards the graph's subscriptions before the returned runner uses
them. Reverse disposal also matches the core unlink algorithm's preference for
removing recently added subscribers first.

`createSignals` measures allocation of unread signals. `createComputations`
creates subscribed effects, evaluates them, and includes disposal in the measured
interval. Profile these separately from steady-state propagation.

```sh
pnpm profile:reatom 0
```

Arguments 0 through 5 select the six dynamic graph workloads. The command
validates sums and evaluation counts, prints timings and memory usage, and writes
a V8 `.cpuprofile` in the current directory.

Earlier local-core investigation results are not guarantees for the published
package. Library failures are retained in benchmark reports with diagnostics.
