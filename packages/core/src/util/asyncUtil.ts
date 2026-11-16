/** return a promise that completes after a set number of milliseconds */
export function promiseDelay(timeout = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

export const nextTick = () => promiseDelay(0);

export function collectGarbage(): void {
  const gc: unknown = Reflect.get(globalThis, "gc");
  if (typeof gc === "function") {
    gc();
    gc();
  }
}
