## Hand-back 1

Round 2 re-review (bug). B1 is fixed and I found no new problems on the fix lines.

**1. B1: fixed**
- `CaseBody.tsx:68` renders `<DiffViewer files={[frozenDiffFile(c)]} />`.
- `helpers.ts:33-35` (`frozenDiffFile`) now computes `patch = stripDiffHeaders(c.input_diff)`. It uses that stripped patch for both `PrFile.patch` and `countPatchLines`. The stored `input_diff` is unchanged.
- `helpers.ts:24-28` (`stripDiffHeaders`) slices from the first line starting with `@@`. That is the same marker `parsePatch` (`components/diff-viewer/helpers.ts:18`) treats as a hunk header, so the `diff --git`, `index`, `---` and `+++` lines no longer reach the viewer.

Edge cases:
- **Several hunks:** only the lines before the first `@@` are cut, so later hunks pass through intact and `parsePatch` handles each.
- **Header-only string with no `@@`:** `findIndex` returns -1, so the input is returned unchanged and its header lines would still render as rows. This can't happen for stored frozen diffs: `extractFileDiff` in `server/src/modules/eval/frozen-input.ts` returns null when a section has no hunk, and `freezeFileDiff` also fails on an empty parse. The unchanged path is therefore only a defensive fallback.
- **`\ No newline at end of file`:** `countPatchLines` skips it because it matches neither `+` nor `-`. `parsePatch` shows it as a context row, which is the same shared-viewer behavior as before. It was not added by this fix.
- **CRLF:** the split is on `\n`, so lines keep a trailing `\r`. `startsWith("@@")` and `startsWith("+")`/`("-")` still work, so stripping and counting are correct. Any `\r` display effect is the same as before.
- **Hunk header at line 1:** `first === 0`, so `first <= 0` returns the input unchanged, which is correct.

**2. New problems on the fix lines:** none. The new tests in `helpers.test.ts` do pass the stripped patch to the viewer and check the +/- counts. They don't cover several hunks, CRLF or a hunk header at line 1, but the logic handles all three.

```findings-json
{
  "reviewer": "bug",
  "findings": []
}
```