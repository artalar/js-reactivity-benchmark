import type {
  Diagnostic,
  TestOutcome,
  TestMetadata,
} from "js-reactivity-benchmark/src/results";
export type {
  Diagnostic,
  TestOutcome,
  FrameworkRun,
  Report,
} from "js-reactivity-benchmark/src/results";

export type WorkerMessage =
  | {
      type: "catalog";
      frameworks: string[];
      tests: string[];
      metadata?: TestMetadata[];
      versions?: Record<string, string>;
    }
  | { type: "start"; test: string }
  | { type: "outcome"; outcome: TestOutcome }
  | { type: "diagnostics"; diagnostics: Diagnostic[] }
  | { type: "done" }
  | { type: "fatal"; message: string };
