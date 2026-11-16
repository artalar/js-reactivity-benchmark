import {
  analyzeReport,
  compatibilityIssues,
  outcomeStatus,
  type Report,
} from "js-reactivity-benchmark/src/results";
import { reportDocument } from "js-reactivity-benchmark/src/reportView";

export const renderHtml = reportDocument;

export function printReport(
  report: Report,
  baseline = "fastest",
  detailed = false,
  previous?: Report,
) {
  const analysis = analyzeReport(
    report,
    baseline,
    undefined,
    undefined,
    previous && compatibilityIssues(report, previous).length === 0
      ? previous
      : undefined,
  );
  const entries = analysis.rows.flatMap((row) => row.entries);
  const passed = entries.filter((entry) => entry.status === "passed").length;
  console.log(
    `\nCompleted in ${(report.duration / 1000).toFixed(1)}s · ${passed}/${entries.length} valid results · timings in ms`,
  );
  console.log(
    `Baseline: ${baseline} · lower time is better · shared coverage ${analysis.common}/${report.tests.length}`,
  );
  for (const summary of [...analysis.summary].sort(
    (a, b) => (a.ratio ?? Infinity) - (b.ratio ?? Infinity),
  )) {
    console.log(
      `  ${summary.framework.padEnd(24)} ${summary.ratio === undefined ? "—" : `${summary.ratio.toFixed(2)}× time / baseline`} · ${summary.passed}/${summary.total} valid`,
    );
  }
  const failures = entries.filter((entry) => entry.status !== "passed");
  if (failures.length)
    console.log(
      `\n${failures.length} failed, interrupted or not-run result(s). See the HTML report for diagnostics.`,
    );
  const diagnostics = report.runs.flatMap((run) => [
    ...run.diagnostics,
    ...run.outcomes.flatMap((outcome) => outcome.diagnostics),
  ]);
  const errors = diagnostics
    .filter((item) => item.level === "error")
    .reduce((sum, item) => sum + item.count, 0);
  if (errors) console.log(`${errors} error occurrence(s) recorded.`);
  if (previous) {
    const issues = compatibilityIssues(report, previous);
    if (issues.length)
      console.log(
        `\nPrevious run comparison needs review: ${issues.join(" ")}`,
      );
    else {
      const changes = analysis.rows
        .flatMap((row) =>
          row.entries
            .filter((entry) => entry.change !== undefined)
            .map((entry) => ({ ...entry, test: row.test })),
        )
        .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))
        .slice(0, 5);
      console.log("\nLargest time changes vs previous run:");
      changes.forEach((entry) =>
        console.log(
          `  ${entry.framework} / ${entry.test}: ${entry.change! > 0 ? "+" : ""}${entry.change!.toFixed(1)}%`,
        ),
      );
    }
  }
  if (detailed)
    for (const row of analysis.rows) {
      console.log(`\n${row.test}`);
      for (const entry of [...row.entries].sort(
        (a, b) => (a.time ?? Infinity) - (b.time ?? Infinity),
      ))
        console.log(
          `  ${entry.framework.padEnd(24)} ${entry.time === undefined ? entry.status : `${entry.time.toFixed(3)} ms`} ${entry.ratio === undefined ? "" : `· ${entry.ratio.toFixed(2)}× · ${entry.percent! > 0 ? "+" : ""}${entry.percent!.toFixed(1)}% time`}`,
        );
    }
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
export function renderCsv(report: Report, baseline = "fastest") {
  const analysis = analyzeReport(report, baseline);
  const rows: (string | number)[][] = [
    [
      "framework",
      "test",
      "status",
      "time_ms",
      "errors",
      "time_ratio",
      "time_change_percent",
    ],
  ];
  for (const run of report.runs)
    for (const test of report.tests) {
      const outcome = run.outcomes.find((item) => item.test === test);
      const entry = analysis.rows
        .find((row) => row.test === test)!
        .entries.find((entry) => entry.framework === run.framework)!;
      rows.push([
        run.framework,
        test,
        outcomeStatus(outcome, run),
        outcome?.time ?? "",
        outcome?.diagnostics
          .filter((item) => item.level === "error")
          .reduce((sum, item) => sum + item.count, 0) ?? 0,
        entry.ratio ?? "",
        entry.percent ?? "",
      ]);
    }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
export function renderMarkdown(report: Report, baseline = "fastest") {
  const cell = (value: string) =>
    value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const analysis = analyzeReport(report, baseline);
  return [
    "# JS Reactivity Benchmark",
    "",
    `${report.startedAt} · ${report.node} · ${report.platform} · ${report.concurrency} process(es)`,
    "",
    `Baseline: ${cell(baseline)}. Lower time is better.`,
    "",
    "| Benchmark | Library | Time (ms) | Time / baseline | Time change |",
    "| --- | --- | ---: | ---: | ---: |",
    ...analysis.rows.flatMap((row) =>
      row.entries.map(
        (entry) =>
          `| ${cell(row.test)} | ${cell(entry.framework)} | ${entry.time?.toFixed(3) ?? entry.status} | ${entry.ratio === undefined ? "—" : `${entry.ratio.toFixed(2)}×`} | ${entry.percent === undefined ? "—" : `${entry.percent > 0 ? "+" : ""}${entry.percent.toFixed(1)}%`} |`,
      ),
    ),
    "",
    "Percentages describe measured time, not statistical significance.",
    "",
  ].join("\n");
}
