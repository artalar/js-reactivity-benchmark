import { ReactiveFramework } from "../util/reactiveFramework";
import { act } from "./act.source";

export const actFramework: ReactiveFramework = {
  name: "act",
  signal: (initial) => {
    const data = act(initial);
    return {
      read: data,
      write: data,
    };
  },
  computed: (fn) => {
    return {
      read: act(fn),
    };
  },
  effect: (fn) => act(fn).subscribe(() => {}),
  withBatch: (fn) => {
    fn();
    act.notify();
  },
  withBuild: (fn) => fn(),
};
