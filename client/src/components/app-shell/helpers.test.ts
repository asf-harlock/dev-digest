import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("Project Context nav", () => {
  it("AC-10: 'Project Context' is in the WORKSPACE group and is active on /repos/:id/context", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE");
    const item = workspace?.items.find((i) => i.label === "Project Context");
    expect(item).toMatchObject({ key: "context", href: "/repos/:repoId/context" });
    expect(activeKeyFor("/repos/r1/context")).toBe(item?.key);
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
  });
});
