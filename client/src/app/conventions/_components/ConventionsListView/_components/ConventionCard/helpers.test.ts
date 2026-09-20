import { describe, it, expect } from "vitest";
import { confidenceColor, evidenceLabel, formatCategoryLabel } from "./helpers";

describe("confidenceColor", () => {
  it("is ok-colored at or above 85%", () => {
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.85)).toBe("var(--ok)");
  });

  it("is warn-colored between 65% and 85%", () => {
    expect(confidenceColor(0.78)).toBe("var(--warn)");
    expect(confidenceColor(0.65)).toBe("var(--warn)");
  });

  it("is muted below 65%", () => {
    expect(confidenceColor(0.4)).toBe("var(--text-muted)");
  });
});

describe("evidenceLabel", () => {
  it("renders a line range when start and end differ", () => {
    expect(evidenceLabel({ path: "src/api/users.ts", start_line: 23, end_line: 31, snippet: "" })).toBe(
      "src/api/users.ts:23-31",
    );
  });

  it("renders a single line number when start equals end", () => {
    expect(evidenceLabel({ path: "src/lib/redis.ts", start_line: 1, end_line: 1, snippet: "" })).toBe(
      "src/lib/redis.ts:1",
    );
  });
});

describe("formatCategoryLabel", () => {
  it("replaces underscores with spaces and capitalizes the first letter", () => {
    expect(formatCategoryLabel("error_handling")).toBe("Error handling");
    expect(formatCategoryLabel("naming")).toBe("Naming");
  });
});
