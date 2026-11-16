import {
  analyzeReport,
  compatibilityIssues,
  parseReport,
  type Report,
} from "./results";

export const reportStyles = `
:root{color-scheme:light dark;--bg:#101316;--panel:#191e23;--text:#eef1f4;--muted:#a1aab4;--line:#323b44;--accent:#ffb86b;--good:#7bdfb2;--bad:#ff9c9c;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:var(--bg);color:var(--text)}
*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button,select,input[type=search]{border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--text);padding:9px 12px}button{cursor:pointer}button:hover{border-color:var(--accent)}button:disabled{opacity:.45;cursor:wait}button.primary{background:var(--accent);color:#21180e;border-color:var(--accent);font-weight:650}a{color:var(--accent)}:focus-visible{outline:2px solid var(--accent);outline-offset:3px}main,.report-shell{max-width:1400px;margin:auto;padding:36px 24px}h1{font-size:clamp(26px,4vw,42px);letter-spacing:-.04em;margin:8px 0 12px}h2{font-size:20px;margin:0 0 16px}h3{font-size:16px}p{line-height:1.6}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:11px;font-weight:700;color:var(--accent)}.muted,.help,small{color:var(--muted)}.help{font-size:13px;line-height:1.6}.header-line,.actions,.toolbar,.chips{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.header-line{justify-content:space-between}.actions{margin:18px 0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:24px 0}.card,section.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px}.card strong{display:block;font-size:28px;font-variant-numeric:tabular-nums;margin:6px 0}.card span{color:var(--muted);font-size:12px}.toolbar{position:sticky;top:0;background:var(--bg);padding:14px 0;z-index:3;border-bottom:1px solid var(--line)}label{font-size:13px}label select{margin-left:6px}.chips{padding:14px 0;gap:8px}.chips label{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:7px 11px}.chips input{accent-color:var(--accent);margin-right:6px}section.panel{margin:18px 0}.table-wrap{overflow:auto;max-height:70vh}table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:12px;border-bottom:1px solid var(--line);white-space:nowrap}th{font-weight:550}thead th{position:sticky;top:0;background:var(--panel);z-index:2;color:var(--muted)}.matrix tbody th{position:sticky;left:0;background:var(--panel);z-index:1;max-width:250px;overflow:hidden;text-overflow:ellipsis}.matrix thead th:first-child{left:0;z-index:3}.good{color:var(--good)}.bad{color:var(--bad)}.track{height:12px;min-width:80px;max-width:520px;background:var(--bg);border-radius:3px;overflow:hidden}.bar{height:100%;border-radius:3px}.chart td:nth-child(3){width:40%}.chart .best{color:var(--good)}details{margin:10px 0}summary{cursor:pointer;padding:8px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-size:12px}.notice{padding:12px 16px;border-left:3px solid var(--accent);background:var(--panel);font-size:13px;line-height:1.6;margin:16px 0}.empty{padding:32px;color:var(--muted);text-align:center}.choice-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.choice-list{max-height:350px;overflow:auto}.choice-list label{display:block;padding:9px 4px}.choice-list small{display:block;padding-left:25px;font-size:12px}.choice-list input{accent-color:var(--accent)}progress{width:100%;height:12px;accent-color:var(--accent)}[hidden]{display:none!important}body.light{color-scheme:light;--bg:#f7f8fa;--panel:#fff;--text:#1c2530;--muted:#536171;--line:#dce1e7;--accent:#995000;--good:#14734d;--bad:#b12d38}body.light button.primary{color:white}@media(max-width:650px){main,.report-shell{padding:20px 12px}.toolbar{position:static}th,td{padding:9px}.chart td:nth-child(3){display:none}.cards{grid-template-columns:repeat(2,1fr)}}@media print{.toolbar,.actions,.chips{display:none}.table-wrap{max-height:none}section.panel{break-inside:avoid}body{--bg:white;--panel:white;--text:black;--muted:#444;--line:#ddd}}
`;

export function mountReport(
  root: HTMLElement,
  report: Report,
  analyze: typeof analyzeReport,
  compatibility: typeof compatibilityIssues,
  parse: typeof parseReport,
  initialPrevious?: Report,
) {
  const escape = (value: unknown) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char]!,
    );
  const colors = [
    "#67b7dc",
    "#ed9d72",
    "#9bd59b",
    "#c4a0e5",
    "#e6c864",
    "#e391ba",
    "#76cfc0",
  ];
  const color = (name: string) =>
    colors[
      [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
        colors.length
    ];
  const signed = (value: number) =>
    `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  let previous = initialPrevious;
  let baseline = "fastest";
  let metric = "time";
  let query = "";
  let group = "all";
  let view = "charts";
  let sort = "time";
  let onlyErrors = false;
  const selected = new Set(report.runs.map((run) => run.framework));
  const groups = [...new Set(report.metadata?.map((item) => item.group) ?? [])];
  let allowComparison = false;
  const download = (name: string, contents: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const all = analyze(report);
  const passed = all.rows
    .flatMap((row) => row.entries)
    .filter((entry) => entry.status === "passed").length;
  const total = report.tests.length * report.runs.length;
  root.innerHTML = `<header><div class="header-line"><span class="eyebrow">Reactivity / benchmark report</span><button data-action="theme">Toggle theme</button></div><h1>See where the time goes.</h1><p class="muted">${escape(report.startedAt)} · ${escape(report.environment ?? "node")} · ${escape(report.mode ?? (report.concurrency > 1 ? "quick" : "compare"))} · ${report.concurrency} process(es)</p></header>
  <div class="cards"><div class="card"><span>VALID RESULTS</span><strong>${passed}<small> / ${total}</small></strong></div><div class="card"><span>LIBRARIES</span><strong>${report.runs.length}</strong></div><div class="card"><span>BENCHMARKS</span><strong>${report.tests.length}</strong></div><div class="card"><span>ELAPSED</span><strong>${(report.duration / 1000).toFixed(1)}<small> s</small></strong></div></div>
  ${passed < total ? `<div class="notice">${total - passed} result(s) failed, interrupted or not run. These results are excluded from numerical comparisons.</div>` : ""}
  ${report.concurrency > 1 ? '<div class="notice">Concurrent processes share CPU and memory. Use compare mode with one job for timing comparisons.</div>' : ""}
  <div class="actions"><button data-action="json">Download JSON</button><button data-action="csv">Download CSV</button><button data-action="markdown">Export visible Markdown</button><label><button data-action="load">Compare a previous run…</button><input data-file type="file" accept=".json,application/json" hidden></label></div><div data-history aria-live="polite"></div>
  <div class="toolbar"><input data-query type="search" placeholder="Filter benchmarks…" aria-label="Filter benchmarks"><label>Group <select data-group><option value="all">All groups</option>${groups.map((name) => `<option>${escape(name)}</option>`).join("")}</select></label><label>Baseline <select data-baseline><option value="fastest">Fastest per test</option>${report.runs.map((run) => `<option>${escape(run.framework)}</option>`).join("")}</select></label><label>Show <select data-metric><option value="time">Time (ms)</option><option value="ratio">Time / baseline (×)</option><option value="percent">Time change (%)</option></select></label><label>View <select data-view><option value="charts">Charts</option><option value="matrix">Matrix</option></select></label><label>Sort <select data-sort><option value="time">Fastest first</option><option value="name">Library name</option><option value="catalog">Catalog order</option></select></label><label><input data-errors type="checkbox"> Only failures</label></div>
  <div class="chips" role="group" aria-label="Visible libraries">${report.runs.map((run, index) => `<label><input type="checkbox" data-framework="${index}" checked>${escape(run.framework)}</label>`).join("")}<button data-action="all">All</button><button data-action="pair">Baseline + one</button></div><div data-content></div>
  <section class="panel"><h2>Diagnostics</h2><div data-diagnostics></div></section>
  <section class="panel"><h2>Reproduce this run</h2><p class="help">${escape(report.node)} · ${escape(report.platform)} · ${escape(report.cpu)}<br>GC: ${report.gc === undefined ? "unknown" : report.gc ? "available" : "unavailable"} · Commit: ${escape(report.commit ?? "unknown")}${report.dirty ? " (working tree modified)" : ""}</p>${report.command ? `<pre>${escape(report.command)}</pre>` : ""}<details><summary>Library versions</summary><pre>${escape(JSON.stringify(report.versions ?? {}, null, 2))}</pre></details><p class="help">Lower time is better. A ratio of 1.20× means 20% more time than the baseline. Bars use an independent scale per test. Group summaries use geometric means on the shared set of valid, positive timings. Percentages describe measured time, not statistical significance. Missing or zero baselines have no ratio.</p></section>`;
  const element = <T extends HTMLElement>(selector: string) => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Missing report control: ${selector}`);
    return found;
  };
  function current() {
    const tests = report.tests.filter(
      (test) =>
        test.toLowerCase().includes(query.toLowerCase()) &&
        (group === "all" ||
          report.metadata?.find((item) => item.name === test)?.group === group),
    );
    const issues = previous ? compatibility(report, previous) : [];
    const compared =
      previous && (!issues.length || allowComparison) ? previous : undefined;
    const result = analyze(report, baseline, [...selected], tests, compared);
    if (onlyErrors)
      result.rows = result.rows.filter((row) =>
        row.entries.some((entry) => entry.status !== "passed"),
      );
    return { result, issues, compared };
  }
  function format(
    entry: ReturnType<typeof analyzeReport>["rows"][number]["entries"][number],
  ) {
    if (entry.time === undefined) return escape(entry.status);
    if (metric === "ratio")
      return entry.ratio === undefined ? "—" : `${entry.ratio.toFixed(2)}×`;
    if (metric === "percent")
      return entry.percent === undefined ? "—" : signed(entry.percent);
    return `${entry.time.toFixed(3)} ms`;
  }
  function render() {
    const { result, issues, compared } = current();
    const versionChanges = previous
      ? report.runs
          .filter(
            (run) =>
              previous?.runs.some((old) => old.framework === run.framework) &&
              report.versions?.[run.framework] !==
                previous?.versions?.[run.framework],
          )
          .map(
            (run) =>
              `${run.framework}: ${previous!.versions?.[run.framework] ?? "unknown"} → ${report.versions?.[run.framework] ?? "unknown"}`,
          )
      : [];
    element("[data-history]").innerHTML = previous
      ? `<div class="notice">Previous run: ${escape(previous.startedAt)}. ${issues.length ? `${issues.map(escape).join(" ")} <label><input data-allow type="checkbox" ${allowComparison ? "checked" : ""}> Show changes despite these differences</label>` : "Compatible measurement settings."}<br>${report.tests.filter((test) => !previous!.tests.includes(test)).length} added / ${previous.tests.filter((test) => !report.tests.includes(test)).length} removed tests. ${report.runs.filter((run) => !previous!.runs.some((old) => old.framework === run.framework)).length} added / ${previous.runs.filter((old) => !report.runs.some((run) => run.framework === old.framework)).length} removed libraries. ${compared ? `${result.rows.flatMap((row) => row.entries).filter((entry) => entry.newFailure).length} new failed or missing result(s).` : ""}${versionChanges.length ? `<br>Version changes: ${versionChanges.map(escape).join("; ")}` : ""}</div>`
      : "";
    root
      .querySelector<HTMLInputElement>("[data-allow]")
      ?.addEventListener("change", (event) => {
        allowComparison = (event.currentTarget as HTMLInputElement).checked;
        render();
      });
    const summaries =
      group === "all" ? ["All selected tests", ...groups] : [group];
    const aggregate = summaries
      .map((name) => {
        const names = result.rows
          .filter(
            (row) =>
              name === "All selected tests" ||
              report.metadata?.find((item) => item.name === row.test)?.group ===
                name,
          )
          .map((row) => row.test);
        const summary = analyze(
          report,
          baseline,
          [...selected],
          names,
        ).summary.sort((a, b) => (a.ratio ?? Infinity) - (b.ratio ?? Infinity));
        return `<details ${name === "All selected tests" || group !== "all" ? "open" : ""}><summary>${escape(name)} · shared valid coverage ${summary[0]?.covered ?? 0}/${names.length}</summary><div class="table-wrap"><table><thead><tr><th>Library</th><th>Geometric mean time / baseline</th><th>Valid tests</th></tr></thead><tbody>${summary.map((item) => `<tr><th>${escape(item.framework)}</th><td>${item.ratio === undefined ? "—" : `${item.ratio.toFixed(2)}×`}</td><td>${item.passed}/${item.total}</td></tr>`).join("")}</tbody></table></div></details>`;
      })
      .join("");
    let html = `<section class="panel"><h2>Relative performance</h2><p class="help">Baseline: ${escape(baseline === "fastest" ? "fastest visible library per test" : baseline)}. Shared coverage changes with visible libraries and filters.</p>${aggregate}</section>`;
    if (!result.rows.length || !selected.size)
      html +=
        '<div class="empty">No results match these filters. Select a library or adjust the filters.</div>';
    else if (view === "matrix")
      html += `<section class="panel table-wrap"><table class="matrix"><thead><tr><th>Benchmark</th>${[...selected].map((name) => `<th>${escape(name)}</th>`).join("")}</tr></thead><tbody>${result.rows
        .map(
          (row) =>
            `<tr><th title="${escape(row.test)}">${escape(row.test)}</th>${[
              ...selected,
            ]
              .map((name) => {
                const entry = row.entries.find(
                  (item) => item.framework === name,
                )!;
                const heat =
                  entry.ratio === undefined
                    ? ""
                    : `background:color-mix(in srgb, ${entry.ratio <= 1 ? "var(--good)" : "var(--bad)"} ${Math.min(36, Math.abs(Math.log(entry.ratio)) * 35 + 5)}%,var(--panel))`;
                return `<td style="${heat}" title="${escape(entry.time === undefined ? entry.status : `${entry.time.toFixed(3)} ms`)}">${format(entry)}${compared ? `<small> · ${entry.change === undefined ? "no baseline" : signed(entry.change)}</small>` : ""}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("")}</tbody></table></section>`;
    else
      for (const row of result.rows) {
        const meta = report.metadata?.find((item) => item.name === row.test);
        const entries = [...row.entries];
        if (sort === "time")
          entries.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
        if (sort === "name")
          entries.sort((a, b) => a.framework.localeCompare(b.framework));
        html += `<section class="panel"><span class="eyebrow">${escape(meta?.group ?? "Benchmark")}</span><h2>${escape(row.test)}</h2><p class="help">${escape(meta?.description ?? "")} ${escape(meta?.aggregation ?? "Legacy aggregation")}</p>${meta?.parameters ? `<details><summary>Parameters</summary><pre>${escape(JSON.stringify(meta.parameters, null, 2))}</pre></details>` : ""}<div class="table-wrap"><table class="chart"><thead><tr><th>Library</th><th>${metric === "time" ? "Time" : metric === "ratio" ? "Time / baseline" : "Time change"}</th><th>Measured time</th><th>Relative time</th>${compared ? "<th>Previous run</th>" : ""}</tr></thead><tbody>${entries
          .map(
            (entry) =>
              `<tr><th class="${entry.time !== undefined && entry.time === row.best ? "best" : ""}">${escape(entry.framework)}</th><td>${format(entry)}</td><td><div class="track"><div class="bar" style="width:${entry.time === undefined ? 0 : Math.max(0.4, (entry.time / row.max) * 100)}%;background:${color(entry.framework)}"></div></div></td><td>${entry.ratio === undefined ? "—" : `${entry.ratio.toFixed(2)}× · ${signed(entry.percent!)}`}</td>${
                compared
                  ? `<td class="${(entry.change ?? 0) > 0 ? "bad" : "good"}">${entry.change === undefined ? "no baseline" : signed(entry.change)}${entry.newFailure ? " · new failure" : ""}</td>`
                  : ""
              }</tr>`,
          )
          .join("")}</tbody></table></div></section>`;
      }
    if (selected.size && result.rows.length) {
      const samples = result.rows.flatMap((row) =>
        report.runs
          .filter((run) => selected.has(run.framework))
          .flatMap((run) => {
            const outcome = run.outcomes.find(
              (outcome) => outcome.test === row.test,
            );
            const measurements =
              outcome?.measurements ??
              (outcome?.samples
                ? [{ name: row.test, samples: outcome.samples }]
                : []);
            return measurements
              .filter((measurement) => measurement.samples.length)
              .map((measurement) => {
                const ordered = [...measurement.samples].sort((a, b) => a - b);
                const middle = Math.floor(ordered.length / 2);
                const median =
                  ordered.length % 2
                    ? ordered[middle]
                    : (ordered[middle - 1] + ordered[middle]) / 2;
                return `<tr><th>${escape(run.framework)}</th><td>${escape(row.test)}</td><td>${escape(measurement.name)}</td><td>${ordered.length}</td><td>${ordered[0].toFixed(3)}</td><td>${median.toFixed(3)}</td><td>${ordered[ordered.length - 1].toFixed(3)}</td></tr>`;
              });
          }),
      );
      if (samples.length)
        html += `<section class="panel"><details><summary>Individual measurements & spread</summary><p class="help">Sample statistics in ms. These describe individual repetitions; the reported benchmark time retains its original minimum or sum aggregation. S benchmarks list their subcases separately.</p><div class="table-wrap"><table><thead><tr><th>Library</th><th>Benchmark</th><th>Subcase</th><th>Samples</th><th>Min</th><th>Median</th><th>Max</th></tr></thead><tbody>${samples.join("")}</tbody></table></div></details></section>`;
    }
    element("[data-content]").innerHTML = html;
    const messages = report.runs
      .filter((run) => selected.has(run.framework))
      .flatMap((run) =>
        [
          ...run.diagnostics,
          ...run.outcomes.flatMap((outcome) => outcome.diagnostics),
        ]
          .filter(
            (item) =>
              item.test === "process" ||
              result.rows.some((row) => row.test === item.test),
          )
          .map(
            (item) =>
              `<details><summary><span class="${item.level === "error" ? "bad" : "muted"}">${escape(item.level)}</span> · ${escape(run.framework)} / ${escape(item.test)} · ${item.count} occurrence(s)</summary><pre>${escape(item.message)}</pre></details>`,
          ),
      );
    element("[data-diagnostics]").innerHTML =
      messages.join("") ||
      '<p class="help">No diagnostics for the current selection.</p>';
  }
  for (const [selector, update] of [
    [
      "[data-query]",
      (value: string) => {
        query = value;
      },
    ],
    [
      "[data-group]",
      (value: string) => {
        group = value;
      },
    ],
    [
      "[data-baseline]",
      (value: string) => {
        baseline = value;
        selected.add(value);
        if (value === "fastest") selected.delete(value);
        for (const checkbox of root.querySelectorAll<HTMLInputElement>(
          "[data-framework]",
        ))
          checkbox.checked = selected.has(
            report.runs[Number(checkbox.dataset.framework)].framework,
          );
      },
    ],
    [
      "[data-metric]",
      (value: string) => {
        metric = value;
      },
    ],
    [
      "[data-view]",
      (value: string) => {
        view = value;
      },
    ],
    [
      "[data-sort]",
      (value: string) => {
        sort = value;
      },
    ],
  ] as const)
    element<HTMLInputElement | HTMLSelectElement>(selector).addEventListener(
      "input",
      (event) => {
        update((event.currentTarget as HTMLInputElement).value);
        render();
      },
    );
  element<HTMLInputElement>("[data-errors]").addEventListener(
    "change",
    (event) => {
      onlyErrors = (event.currentTarget as HTMLInputElement).checked;
      render();
    },
  );
  for (const checkbox of root.querySelectorAll<HTMLInputElement>(
    "[data-framework]",
  ))
    checkbox.addEventListener("change", () => {
      const name = report.runs[Number(checkbox.dataset.framework)].framework;
      if (checkbox.checked) selected.add(name);
      else selected.delete(name);
      if (baseline === name && !checkbox.checked) {
        baseline = "fastest";
        element<HTMLSelectElement>("[data-baseline]").value = baseline;
      }
      render();
    });
  element<HTMLInputElement>("[data-file]").addEventListener(
    "change",
    async (event) => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.size > 50_000_000) throw new Error("Report exceeds 50 MB");
        previous = parse(JSON.parse(await file.text()));
        allowComparison = false;
        render();
      } catch (error) {
        element("[data-history]").textContent =
          `Cannot load report: ${String(error)}`;
      }
    },
  );
  root.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-action]")
        : null;
    const action = target?.dataset.action;
    if (action === "theme") document.body.classList.toggle("light");
    if (action === "load") element<HTMLInputElement>("[data-file]").click();
    if (action === "all" || action === "pair") {
      selected.clear();
      const names = report.runs.map((run) => run.framework);
      if (action === "all") names.forEach((name) => selected.add(name));
      else {
        const reference = baseline === "fastest" ? names[0] : baseline;
        selected.add(reference);
        const other = names.find((name) => name !== reference);
        if (other) selected.add(other);
      }
      for (const checkbox of root.querySelectorAll<HTMLInputElement>(
        "[data-framework]",
      ))
        checkbox.checked = selected.has(
          names[Number(checkbox.dataset.framework)],
        );
      render();
    }
    if (action === "json")
      download(
        "report.json",
        JSON.stringify(report, null, 2),
        "application/json",
      );
    if (action === "csv") {
      const rows = [
        [
          "framework",
          "test",
          "status",
          "time_ms",
          "ratio",
          "time_change_percent",
          "previous_change_percent",
        ],
        ...current().result.rows.flatMap((row) =>
          row.entries.map((entry) => [
            entry.framework,
            row.test,
            entry.status,
            entry.time ?? "",
            entry.ratio ?? "",
            entry.percent ?? "",
            entry.change ?? "",
          ]),
        ),
      ];
      download(
        "results.csv",
        rows
          .map((row) =>
            row
              .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n"),
        "text/csv",
      );
    }
    if (action === "markdown") {
      const cell = (value: string) =>
        value.replaceAll("|", "\\|").replaceAll("\n", " ");
      const lines = [
        "# Reactivity benchmark",
        "",
        `Baseline: ${cell(baseline)}. Lower time is better.`,
        "",
        "| Benchmark | Library | Time (ms) | Time / baseline | Time change | Previous run |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
        ...current().result.rows.flatMap((row) =>
          row.entries.map(
            (entry) =>
              `| ${cell(row.test)} | ${cell(entry.framework)} | ${entry.time?.toFixed(3) ?? entry.status} | ${entry.ratio?.toFixed(2) ?? "—"} | ${entry.percent === undefined ? "—" : signed(entry.percent)} | ${entry.change === undefined ? "—" : signed(entry.change)} |`,
          ),
        ),
        "",
        `${report.node} / ${report.platform} / ${report.concurrency} process(es).`,
      ];
      download("comparison.md", lines.join("\n"), "text/markdown");
    }
  });
  render();
}

export function reportDocument(report: Report, previous?: Report): string {
  const json = (value: unknown) =>
    JSON.stringify(value ?? null)
      .replaceAll("<", "\\u003c")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reactivity benchmark report</title><style>${reportStyles}</style></head><body><main id="report"></main><noscript>Enable JavaScript to explore this report. Raw results are available in report.json and results.csv.</noscript><script>const analyze=${analyzeReport.toString()};const compatibility=${compatibilityIssues.toString()};const parse=${parseReport.toString()};(${mountReport.toString()})(document.getElementById('report'),${json(report)},analyze,compatibility,parse,${json(previous)});</script></body></html>`;
}
