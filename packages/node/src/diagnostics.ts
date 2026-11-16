import { readFile } from "node:fs/promises";
import type { Diagnostic } from "./protocol";

export async function readDiagnostics(path: string): Promise<Diagnostic[]> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
  const entries = new Map<number, Diagnostic>();
  const lines = contents.split("\n");
  lines.pop();
  for (const line of lines) {
    const entry: number | { id: number; diagnostic: Diagnostic } =
      JSON.parse(line);
    if (typeof entry === "number") {
      const diagnostic = entries.get(entry);
      if (diagnostic) diagnostic.count++;
    } else entries.set(entry.id, entry.diagnostic);
  }
  return [...entries.values()];
}
