import type { ReactiveFramework } from "./util/reactiveFramework";
import { frameworkMetadata } from "./frameworkMetadata";

const loaders = {
  "alien-signals": () =>
    import("./frameworks/alienSignals").then((m) => m.alienFramework),
  "angular-signals": () =>
    import("./frameworks/angularSignals2").then((m) => m.angularFramework),
  compostate: () =>
    import("./frameworks/inactive/compostate").then(
      (m) => m.compostateFramework,
    ),
  mobx: () => import("./frameworks/inactive/mobx").then((m) => m.mobxFramework),
  $mol_wire_atom: () =>
    import("./frameworks/molWire").then((m) => m.molWireFramework),
  oby: () => import("./frameworks/inactive/oby").then((m) => m.obyFramework),
  "preact-signals": () =>
    import("./frameworks/preactSignals").then((m) => m.preactSignalFramework),
  reactively: () =>
    import("./frameworks/reactively").then((m) => m.reactivelyFramework),
  "@reatom/core": () =>
    import("./frameworks/reatom").then((m) => m.reatomFramework),
  "s-js": () => import("./frameworks/inactive/s").then((m) => m.sFramework),
  solidjs: () => import("./frameworks/solid").then((m) => m.solidFramework),
  pota: () => import("./frameworks/pota").then((m) => m.potaFramework),
  "svelte-v5": () =>
    import("./frameworks/svelte").then((m) => m.svelteFramework),
  "amadeus-it-group/tansu": () =>
    import("./frameworks/tansu").then((m) => m.tansuFramework),
  "tc39-signals": () =>
    import("./frameworks/tc39signals").then((m) => m.tc39SignalsFramework),
  usignal: () =>
    import("./frameworks/inactive/uSignal").then((m) => m.usignalFramework),
  vue: () =>
    import("./frameworks/inactive/vueReactivity").then(
      (m) => m.vueReactivityFramework,
    ),
  "x-reactivity": () =>
    import("./frameworks/xReactivity").then((m) => m.xReactivityFramework),
} satisfies Record<
  (typeof frameworkMetadata)[number]["id"],
  () => Promise<ReactiveFramework>
>;

export const frameworkCatalog = frameworkMetadata.map((entry) => ({
  ...entry,
  load: loaders[entry.id],
}));
