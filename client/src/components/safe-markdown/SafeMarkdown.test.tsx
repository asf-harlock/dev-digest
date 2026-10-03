import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SafeMarkdown } from "./SafeMarkdown";
import { safeUrl } from "./helpers";

afterEach(cleanup);

describe("safeUrl", () => {
  it("UI-5: blanks javascript:/data:/vbscript: (case and control-char obfuscation), keeps safe URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBe("");
    expect(safeUrl("  java\tscript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,<script>1</script>")).toBe("");
    expect(safeUrl("vbscript:msgbox")).toBe("");
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("./docs/x.md")).toBe("./docs/x.md");
  });
});

describe("SafeMarkdown", () => {
  it("UI-5: renders markdown but never raw HTML; dangerous URLs are blanked", () => {
    const md = [
      "# Title",
      "",
      "<script>window.__pwned = 1</script>",
      "",
      '<img src="x" onerror="window.__pwned=1">',
      "",
      "[bad](javascript:alert(1)) [ok](https://example.com)",
      "",
      "![i](data:image/svg+xml;base64,AAAA)",
    ].join("\n");
    const { container } = render(<SafeMarkdown>{md}</SafeMarkdown>);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
    expect(screen.getByText("bad").closest("a")).not.toHaveAttribute("href");
    const ok = screen.getByRole("link", { name: "ok" });
    expect(ok).toHaveAttribute("href", "https://example.com");
    expect(ok).toHaveAttribute("rel", "noopener noreferrer");
  });
});
