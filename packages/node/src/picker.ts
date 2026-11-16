import {
  clearScreenDown,
  cursorTo,
  emitKeypressEvents,
  moveCursor,
} from "node:readline";

export interface Choice {
  name: string;
  description?: string;
  group?: string;
}

export function picker(
  title: string,
  choices: Choice[],
  initial: string[],
  signal?: AbortSignal,
  single = false,
): Promise<string[] | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      "Interactive selection requires a terminal. Use --framework and --test instead.",
    );
  return new Promise((resolve, reject) => {
    let query = "";
    let cursor = Math.max(
      0,
      choices.findIndex((choice) => initial.includes(choice.name)),
    );
    let lines = 0;
    let message = "";
    const selected = new Set(initial);
    const input = process.stdin;
    const output = process.stdout;
    const wasRaw = input.isRaw;
    const filtered = () =>
      choices.filter((choice) =>
        `${choice.name} ${choice.group ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      );
    function render() {
      if (lines) {
        moveCursor(output, 0, -lines);
        cursorTo(output, 0);
        clearScreenDown(output);
      }
      const visible = filtered();
      cursor = Math.max(0, Math.min(cursor, visible.length - 1));
      const height = Math.max(1, Math.min(12, (output.rows || 24) - 9));
      const start = Math.max(
        0,
        Math.min(cursor - Math.floor(height / 2), visible.length - height),
      );
      const rows = [
        title,
        single
          ? "↑↓ move · Enter choose · Esc back"
          : "↑↓ move · Space toggle · Enter next · Esc back",
        single
          ? "Type to search · Backspace clear"
          : "Type to search · Ctrl+A all visible · Ctrl+D clear visible · Ctrl+I invert · Ctrl+G group",
        `Search: ${query || "…"}   ${selected.size}/${choices.length} selected`,
      ];
      for (const [offset, choice] of visible
        .slice(start, start + height)
        .entries())
        rows.push(
          `${start + offset === cursor ? ">" : " "} ${single ? "" : selected.has(choice.name) ? "[x] " : "[ ] "}${choice.group ? `${choice.group} / ` : ""}${choice.name}`,
        );
      if (!visible.length) rows.push("No matches. Backspace to edit search.");
      const focused = visible[cursor];
      rows.push(focused?.description ?? "", message);
      output.write(
        rows
          .map((row) =>
            row
              .replace(/[\x00-\x1f\x7f]/g, " ")
              .slice(0, Math.max(10, (output.columns || 80) - 1)),
          )
          .join("\n") + "\n",
      );
      lines = rows.length;
    }
    function cleanup() {
      input.off("keypress", onKey);
      output.off("resize", render);
      signal?.removeEventListener("abort", abort);
      input.setRawMode(wasRaw ?? false);
      input.pause();
      output.write("\x1b[?25h");
    }
    function abort() {
      cleanup();
      reject(new Error("Selection cancelled"));
    }
    function onKey(
      text: string | undefined,
      key: { name?: string; ctrl?: boolean; meta?: boolean },
    ) {
      const visible = filtered();
      message = "";
      if (key.ctrl && key.name === "c") {
        abort();
        return;
      }
      if (key.name === "escape") {
        cleanup();
        resolve(undefined);
        return;
      }
      if (key.name === "return") {
        if (single && visible[cursor]) {
          cleanup();
          resolve([visible[cursor].name]);
          return;
        }
        if (!single && selected.size) {
          cleanup();
          resolve(
            choices
              .filter((choice) => selected.has(choice.name))
              .map((choice) => choice.name),
          );
          return;
        }
        message = "Select at least one item.";
      } else if (key.name === "up")
        cursor = (cursor - 1 + visible.length) % Math.max(visible.length, 1);
      else if (key.name === "down")
        cursor = (cursor + 1) % Math.max(visible.length, 1);
      else if (key.name === "home") cursor = 0;
      else if (key.name === "end") cursor = visible.length - 1;
      else if (key.name === "backspace") {
        query = query.slice(0, -1);
        cursor = 0;
      } else if (!single && text === " " && visible[cursor]) {
        const name = visible[cursor].name;
        if (selected.has(name)) selected.delete(name);
        else selected.add(name);
      } else if (
        !single &&
        key.ctrl &&
        ["a", "d", "i", "g"].includes(key.name ?? "")
      ) {
        const targets =
          key.name === "g"
            ? visible.filter(
                (choice) => choice.group === visible[cursor]?.group,
              )
            : visible;
        const enableGroup = targets.some(
          (choice) => !selected.has(choice.name),
        );
        for (const choice of targets) {
          if (
            key.name === "a" ||
            (key.name === "g" && enableGroup) ||
            (key.name === "i" && !selected.has(choice.name))
          )
            selected.add(choice.name);
          else selected.delete(choice.name);
        }
      } else if (
        text &&
        !key.ctrl &&
        !key.meta &&
        !/[\x00-\x1f\x7f]/.test(text)
      ) {
        query += text;
        cursor = 0;
      }
      render();
    }
    if (signal?.aborted) {
      reject(new Error("Selection cancelled"));
      return;
    }
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKey);
    output.on("resize", render);
    signal?.addEventListener("abort", abort, { once: true });
    output.write("\x1b[?25l");
    render();
  });
}
