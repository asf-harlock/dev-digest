import { SHORT_SHA_LENGTH } from "./constants";

export function shortSha(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : null;
}
