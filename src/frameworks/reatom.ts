import {
  atom as createAtom,
  computed as createComputed,
  effect as createEffect,
  context,
} from "@reatom/core";
import { ReactiveFramework } from "../util/reactiveFramework";

export const reatomJsxFramework: ReactiveFramework = {
  name: "Reatom JSX v1000",
  signal: <T>(initialValue: T) => {
    const reatomSignal = createAtom(initialValue);
    return {
      read: () => reatomSignal(),
      write: (value: T) => {
        reatomSignal.set(value);
      },
    };
  },
  computed: <T>(fn: () => T) => {
    const reatomComputed = createComputed(fn);
    return {
      read: () => reatomComputed(),
    };
  },
  effect: (fn) => {
    createEffect(fn);
  },
  withBatch: (fn) => {
    fn();
  },
  withBuild: <T>(fn: () => T) => {
    context.reset();
    return fn();
  },
};
