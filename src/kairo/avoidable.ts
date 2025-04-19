import { ReactiveFramework } from "../util/reactiveFramework";
import { busy } from "./util";

/** avoidable change propagation  */
export function avoidablePropagation(bridge: ReactiveFramework) {
  let head = bridge.signal(0);
  let computed1 = bridge.computed(() => head.read());
  let computed2 = bridge.computed(() => computed1.read());
  let computed3 = bridge.computed(() => (busy(), computed2.read() + 1)); // heavy computation
  let computed4 = bridge.computed(() => computed3.read() + 2);
  let computed5 = bridge.computed(() => computed4.read() + 3);
  let res = 0;
  bridge.effect(() => {
    res = computed5.read();
    busy(); // heavy side effect
  });

  return () => {
    bridge.withBatch(() => {
      head.write(1);
    });
    console.assert(res === 7);
    bridge.withBatch(() => {
      for (let i = 0; i < 1000; i++) {
        head.write(i);
      }
    });
    console.assert(res === 1005);
  };
}
