import { describe, expect, it } from "vitest";
import * as shared from "@devdigest/shared";
import { formatFileRef, parseFileRef } from "./file-ref";

// Guards the client-local copy against drift from the shared contract.
const REFS = [
  "src/a.ts",
  "src/a.ts:12",
  "src/a.ts:12-18",
  "src/a.ts:12-12",
  "src/a.ts:0",
  "src/a.ts:18-12",
  "C:/x/y.ts:3",
  "weird:name.ts",
];
const FORMATS: Array<[string, number | null | undefined, number | null | undefined]> = [
  ["p", undefined, undefined],
  ["p", 0, undefined],
  ["p", 5, undefined],
  ["p", 5, 5],
  ["p", 5, 9],
  ["p", 9, 5],
];

describe("client file-ref mirrors @devdigest/shared", () => {
  it.each(REFS)("parseFileRef(%s)", (ref) => {
    expect(parseFileRef(ref)).toEqual(shared.parseFileRef(ref));
  });
  it.each(FORMATS)("formatFileRef(%s, %s, %s)", (p, s, e) => {
    expect(formatFileRef(p, s, e)).toBe(shared.formatFileRef(p, s, e));
  });
});
