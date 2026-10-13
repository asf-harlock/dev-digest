import { describe, it, expect } from "vitest";
import { formatCost, isTrustedJobUrl } from "./ci-format";

describe("ci-format", () => {
  it("EC-29/EC-37: a dash for an unknown cost and $0.00 for a measured zero", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.12)).toBe("$0.12");
  });

  it("UI-11: trusts only https github.com run URLs of the same repository", () => {
    const ok = "https://github.com/acme/payments-api/actions/runs/123";
    expect(isTrustedJobUrl(ok, "acme/payments-api")).toBe(true);
    expect(isTrustedJobUrl(ok, "ACME/Payments-API")).toBe(true);
    expect(isTrustedJobUrl("https://github.com/other/repo/actions/runs/1", "acme/payments-api")).toBe(false);
    expect(isTrustedJobUrl("https://github.com/acme/payments-api", "acme/payments-api")).toBe(false);
    expect(isTrustedJobUrl("http://github.com/acme/payments-api/actions/runs/1", "acme/payments-api")).toBe(false);
    expect(isTrustedJobUrl("https://github.com.evil.io/acme/payments-api/actions/runs/1", "acme/payments-api")).toBe(false);
    expect(isTrustedJobUrl("https://evil.io/https://github.com/acme/payments-api/actions/runs/1", "acme/payments-api")).toBe(false);
    expect(isTrustedJobUrl("javascript:alert(1)", "acme/payments-api")).toBe(false);
    expect(isTrustedJobUrl("not a url", "acme/payments-api")).toBe(false);
    expect(isTrustedJobUrl(null, "acme/payments-api")).toBe(false);
  });
});
