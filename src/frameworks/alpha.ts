import { ReactiveFramework } from "../util/reactiveFramework";
import { atom, computed, notify } from "../../../reatom/packages/core/build";

console.log({atom, computed, notify})

// process.exit()

export const alphaFramework: ReactiveFramework = {
  name: "alpha",
  signal: (initialValue) => {
    const target = atom(initialValue as any);
    return {
      read: target,
      write: target,
    };
  },
  computed: (fn) => {
    const target = computed(fn);
    return {
      read: target,
    };
  },
  effect: (fn) => computed(fn).subscribe(),
  withBatch: (fn) => {
    let out = fn();
    notify();
    return out;
  },
  withBuild: (fn) => fn(),
};
