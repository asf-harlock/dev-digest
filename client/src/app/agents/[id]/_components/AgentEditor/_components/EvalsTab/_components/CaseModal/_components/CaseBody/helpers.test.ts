import { describe, it, expect } from "vitest";
import { countPatchLines, frozenDiffFile, stripDiffHeaders } from "./helpers";

const HUNK = "@@ -1,2 +1,3 @@\n keep\n-old\n+new\n+more";
const WITH_HEADERS = `diff --git a/src/a.ts b/src/a.ts\nindex 111..222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n${HUNK}`;
const expectation = { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2 } as const;

describe("stripDiffHeaders", () => {
  it("drops everything before the first @@ line", () => {
    expect(stripDiffHeaders(WITH_HEADERS)).toBe(HUNK);
  });
  it("leaves a header-less patch and a patch with no hunk untouched", () => {
    expect(stripDiffHeaders(HUNK)).toBe(HUNK);
    expect(stripDiffHeaders("Binary files differ")).toBe("Binary files differ");
  });
});

describe("frozenDiffFile", () => {
  it("passes only hunk lines to the viewer and counts +/- from them", () => {
    const f = frozenDiffFile({ input_diff: WITH_HEADERS, expectation });
    expect(f.patch).toBe(HUNK);
    expect(f.patch).not.toContain("diff --git");
    expect(f.patch).not.toContain("+++ b/");
    expect(f.path).toBe("src/a.ts");
    expect(f.additions).toBe(2);
    expect(f.deletions).toBe(1);
  });
});

describe("countPatchLines", () => {
  it("ignores header lines before the first hunk", () => {
    expect(countPatchLines(WITH_HEADERS)).toEqual({ additions: 2, deletions: 1 });
  });
});
