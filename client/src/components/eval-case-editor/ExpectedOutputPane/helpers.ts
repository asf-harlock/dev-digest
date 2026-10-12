import type { ExpectedProblem } from "../helpers";

/** Longest offending key shown in a message; the key is user text, so it is cut (UI-1). */
const KEY_SHOWN = 40;

/** Values of the `{key}` placeholder of an Expected output problem message. */
export function problemValues(problem: ExpectedProblem): { key: string } {
  const key = problem.key ?? "";
  return { key: key.length > KEY_SHOWN ? `${key.slice(0, KEY_SHOWN)}…` : key };
}
