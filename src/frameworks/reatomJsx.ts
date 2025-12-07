import {
  atom,
  batch,
  createCtx,
  type Atom,
  type CtxSpy,
} from "@reatom/core";
import { ReactiveFramework } from "../util/reactiveFramework";

const ctx = createCtx();

let activeTrackingCtx: CtxSpy | null = null;

const runWithTracking = <T>(trackingCtx: CtxSpy | null, fn: () => T): T => {
  const previousCtx = activeTrackingCtx;
  activeTrackingCtx = trackingCtx;
  try {
    return fn();
  } finally {
    activeTrackingCtx = previousCtx;
  }
};

const readAtom = <T>(target: Atom<T>): T => {
  if (activeTrackingCtx) {
    return activeTrackingCtx.spy(target);
  }
  return ctx.get(target);
};

export const reatomJsxFramework: ReactiveFramework = {
  name: "Reatom JSX",
  signal: (initialValue) => {
    const baseAtom = atom(initialValue);
    return {
      read: () => readAtom(baseAtom),
      write: (value) => {
        baseAtom(ctx, value);
      },
    };
  },
  computed: (fn) => {
    const derivedAtom = atom((trackingCtx) => runWithTracking(trackingCtx, fn));
    return {
      read: () => readAtom(derivedAtom),
    };
  },
  effect: (fn) => {
    const effectAtom = atom((trackingCtx) =>
      runWithTracking(trackingCtx, () => {
        fn();
      }),
    );
    ctx.subscribe(effectAtom, () => {});
    ctx.get(effectAtom);
  },
  withBatch: (fn) => {
    batch(ctx, () => {
      runWithTracking(null, fn);
    });
  },
  withBuild: (fn) => runWithTracking(null, fn),
};
