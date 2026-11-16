import { ReactiveFramework } from "../util/reactiveFramework";

import { atom, batch, computed } from "@reatom/core";

let subscriptions: (() => void)[] = [];

export const reatomFramework: ReactiveFramework = {
  name: "@reatom/core",
  signal<T>(initialValue: T) {
    const stateAtom = atom(initialValue);
    return {
      read() {
        return stateAtom();
      },
      write(next: T) {
        batch(() => stateAtom.set(next), true);
      },
    };
  },
  computed<T>(fn: () => T) {
    const derived = computed(() => batch(fn));
    return { read: derived };
  },
  effect(fn: () => void | (() => void)) {
    const unsubscribe = computed(() => batch(fn)).subscribe();
    subscriptions.push(unsubscribe);
    return unsubscribe;
  },
  withBatch(fn: () => void) {
    batch(fn, true);
  },
  // Build and execution must use the same context. Disposing subscriptions
  // releases the graph without resetting the process-wide context.
  withBuild: (fn) => fn(),
  cleanup() {
    for (let i = subscriptions.length - 1; i >= 0; i--) {
      subscriptions[i]();
    }

    subscriptions = [];

    batch(() => {}, true);
  },
};
