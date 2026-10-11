import { NAME_MAX_LENGTH } from "./constants";

export type NameProblem = "required" | "tooLong" | null;

/** Client-side mirror of the server's 1–80 rule; the server stays the authority. */
export function nameProblem(raw: string): NameProblem {
  const name = raw.trim();
  if (name.length === 0) return "required";
  if (name.length > NAME_MAX_LENGTH) return "tooLong";
  return null;
}
