import { clearLine, cursorTo } from "node:readline";

export class Progress {
  private readonly start = performance.now();
  private readonly states = new Map<string, string>();
  private completed = 0;
  private timer?: ReturnType<typeof setInterval>;
  private readonly live = Boolean(
    process.stdout.isTTY && process.env.TERM !== "dumb",
  );
  constructor(private readonly total: number) {
    if (this.live) this.timer = setInterval(() => this.render(), 1000).unref();
  }
  active(framework: string, test: string) {
    this.states.set(framework, test);
    if (this.live) this.render();
    else console.log(`Started ${framework} / ${test}`);
  }
  finishTest() {
    this.completed++;
    this.render();
  }
  finish(framework: string, attempted: number) {
    this.states.delete(framework);
    this.completed += attempted;
    this.render();
  }
  log(message: string) {
    this.clear();
    console.log(message);
    this.render();
  }
  private clear() {
    if (this.live) {
      cursorTo(process.stdout, 0);
      clearLine(process.stdout, 0);
    }
  }
  private render() {
    if (!this.live) return;
    this.clear();
    const elapsed = (performance.now() - this.start) / 1000;
    const active = [...this.states]
      .map(([framework, test]) => `${framework}: ${test}`)
      .join(" · ");
    const text = `${this.completed}/${this.total} · ${elapsed.toFixed(0)}s · ${this.states.size} active · ${active} · Ctrl+C saves partial results`;
    process.stdout.write(
      text
        .replace(/[\x00-\x1f\x7f]/g, " ")
        .slice(0, Math.max(10, (process.stdout.columns || 80) - 1)),
    );
  }
  close() {
    clearInterval(this.timer);
    this.clear();
  }
}
