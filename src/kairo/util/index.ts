export function busy() {
  let a = 0;
  for (let i = 0; i < 100_000; i++) {
    a++;
  }
}
