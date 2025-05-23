import { ReactiveFramework } from "../util/reactiveFramework";
import {
  batch,
  createRenderEffect,
  createMemo,
  createRoot,
  createSignal,
} from "solid-js/dist/solid.js";

export const solidFramework: ReactiveFramework = {
  name: "SolidJS",
  signal: (initialValue) => {
    const [getter, setter] = createSignal(initialValue);
    return {
      write: (v) => setter(v as any),
      read: () => getter(),
    };
  },
  computed: (fn) => {
    const memo = createMemo(fn);
    return {
      read: () => memo(),
    };
  },
  effect: (fn) => createRenderEffect(fn),
  withBatch: (fn) => batch(fn),
  withBuild: (fn) => createRoot(fn),
};
