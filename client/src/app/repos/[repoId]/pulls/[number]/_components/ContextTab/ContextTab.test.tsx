import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrContextResponse, PrContextPreview } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prContext.json";
import { ContextTab } from "./ContextTab";

/* Only the network is faked (global fetch); hooks, components and the i18n
   provider are real. Covers SPEC-07 AC-2/4/7/8/9, EC-8/14..20/25, NFR-6/7, UI-7. */

type Entry = PrContextResponse["entries"][number];
const entry = (over: Partial<Entry> & { path: string }): Entry => ({
  kind: "specs",
  origin: "default_branch",
  status: "attached",
  tokens: 10,
  read_at_sha: "a".repeat(40),
  warnings: [],
  ...over,
});

function view(over: Partial<PrContextResponse> = {}): PrContextResponse {
  return {
    entries: [],
    suggestions: [],
    attachable: [],
    budget: { used: 0, limit: 10000 },
    fingerprint: null,
    cloned: true,
    map_reduce: false,
    ...over,
  };
}

interface Net {
  get: () => Response | Promise<Response>;
  put: (paths: string[]) => Response | Promise<Response>;
  preview: (path: string) => Response | Promise<Response>;
  puts: string[][];
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let net: Net;
beforeEach(() => {
  net = {
    get: () => json(view()),
    put: () => json(view()),
    preview: () => json({}),
    puts: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const paths = JSON.parse(String(init.body)).paths as string[];
        net.puts.push(paths);
        return net.put(paths);
      }
      if (String(url).includes("/context/preview")) {
        return net.preview(new URL(String(url)).searchParams.get("path") ?? "");
      }
      return net.get();
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prContext: messages }}>
        <ContextTab prId="pr-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const attachedList = () => screen.getByRole("region", { name: "Attached documents" });

describe("ContextTab states", () => {
  it("EC-18: shows a skeleton while loading", () => {
    net.get = () => new Promise<Response>(() => {});
    renderTab();
    expect(screen.getByTestId("context-skeleton")).toBeInTheDocument();
  });

  it("EC-17: a load failure shows the error and Retry reloads the tab", async () => {
    net.get = () => json({ error: { code: "internal_error", message: "boom" } }, 500);
    renderTab();
    expect(await screen.findByText("Couldn't load the PR context")).toBeInTheDocument();

    net.get = () => json(view({ attachable: [{ path: "docs/a.md", kind: "docs", origin: "default_branch" }] }));
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("checkbox", { name: "docs/a.md" })).toBeInTheDocument();
  });

  it("EC-1: not cloned shows its own notice, distinct from the empty state", async () => {
    net.get = () => json(view({ cloned: false }));
    renderTab();
    expect(await screen.findByText(/isn't cloned locally/)).toBeInTheDocument();
    expect(screen.getByText("No documents attached to this PR yet.")).toBeInTheDocument();
  });

  it("EC-19: empty attachable list explains there is nothing to attach; cloned repos show no notice", async () => {
    renderTab();
    expect(await screen.findByText(/A \.md file under specs\/, docs\/ or insights\/ .* becomes attachable/)).toBeInTheDocument();
    expect(screen.queryByText(/isn't cloned locally/)).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("EC-20: a filter that matches nothing says so, with a Clear filter action that restores the list", async () => {
    net.get = () =>
      json(
        view({
          attachable: [
            { path: "docs/a.md", kind: "docs", origin: "default_branch" },
            { path: "specs/b.md", kind: "specs", origin: "added" },
          ],
        }),
      );
    renderTab();
    const filter = await screen.findByRole("searchbox", { name: "Filter documents" });
    fireEvent.change(filter, { target: { value: "zzz" } });
    expect(screen.getByText(/No documents match/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "docs/a.md" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(filter).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: "zzz" } });
    fireEvent.change(filter, { target: { value: "SPECS" } });
    expect(screen.getByRole("checkbox", { name: "specs/b.md" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "docs/a.md" })).not.toBeInTheDocument();
  });
});

describe("ContextTab list (AC-2, AC-4, AC-8, AC-9, EC-8, EC-25, NFR-6, NFR-7)", () => {
  const two = view({
    entries: [
      entry({ path: "specs/07.md", origin: "added", tokens: 120 }),
      entry({ path: "docs/guide.md", kind: "docs", origin: "modified", tokens: 30, warnings: ["ignore-previous"] }),
      entry({ path: "docs/gone.md", kind: "docs", status: "missing", tokens: 0 }),
    ],
    attachable: [{ path: "docs/other.md", kind: "docs", origin: "default_branch" }],
    budget: { used: 150, limit: 10000 },
    map_reduce: true,
  });

  it("AC-2 / AC-8 / AC-9 / EC-8 / EC-25: rows show origin, tokens (≈), status, warning; footer shows total and map-reduce hint", async () => {
    net.get = () => json(two);
    renderTab();
    const list = within(await screen.findByRole("region", { name: "Attached documents" }));
    const rows = list.getAllByRole("listitem");
    expect(rows.map((r) => within(r).getByRole("checkbox").getAttribute("aria-label"))).toEqual([
      "specs/07.md",
      "docs/guide.md",
      "docs/gone.md",
    ]);
    expect(within(rows[0]!).getByText("added in this PR")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("≈ 120 tokens")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("modified in this PR")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("possible injection")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("missing")).toBeInTheDocument();
    expect(within(rows[2]!).getByRole("checkbox")).toBeChecked(); // removable, still in the stored list
    expect(list.getByText("≈ 150 of 10,000 tokens")).toBeInTheDocument();
    expect(list.getByText(/sent with each part/)).toBeInTheDocument();
    expect(list.getByText("Agent and skill documents keep at least 6,000 tokens per review call.")).toBeInTheDocument();
  });

  it("NFR-7: the total and a save failure are announced through polite live regions", async () => {
    net.get = () => json(two);
    renderTab();
    const total = await screen.findByText("≈ 150 of 10,000 tokens");
    expect(total).toHaveAttribute("aria-live", "polite");
    const [, failure] = within(attachedList()).getAllByRole("status");
    expect(failure).toHaveAttribute("aria-live", "polite");
  });

  it("NFR-6 / AC-4: Move up/down buttons reorder by keyboard and save the full ordered list; edge moves are disabled", async () => {
    net.get = () => json(two);
    net.put = (paths) => {
      const saved = { ...two, entries: paths.map((p) => two.entries.find((e) => e.path === p)!) };
      net.get = () => json(saved); // the server now holds the new order
      return json(saved);
    };
    renderTab();
    const up = await screen.findByRole("button", { name: "Move specs/07.md up" });
    expect(up).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move docs/gone.md down" })).toBeDisabled();

    const moveDown = screen.getByRole("button", { name: "Move specs/07.md down" });
    fireEvent.click(moveDown); // a real Enter/Space on a <button> dispatches click
    await waitFor(() => expect(net.puts).toEqual([["docs/guide.md", "specs/07.md", "docs/gone.md"]]));
    await waitFor(() => {
      const names = within(attachedList()).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
      expect(names).toEqual(["docs/guide.md", "specs/07.md", "docs/gone.md"]);
    });
  });

  it("AC-4: unchecking removes the path; checking an available document appends it", async () => {
    net.get = () => json(two);
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/gone.md" }));
    await waitFor(() => expect(net.puts[0]).toEqual(["specs/07.md", "docs/guide.md"]));
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/other.md" }));
    await waitFor(() => expect(net.puts[1]).toContain("docs/other.md"));
  });

  it("EC-14: controls are disabled while a save is in flight", async () => {
    net.get = () => json(two);
    let release!: () => void;
    net.put = () => new Promise<Response>((res) => (release = () => res(json(two))));
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/other.md" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "specs/07.md" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Move docs/guide.md up" })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "specs/07.md" })).toBeEnabled());
  });

  it("EC-15: a failed save restores the last saved list and announces the failure", async () => {
    net.get = () => json(two);
    net.put = () => json({ error: { code: "internal_error", message: "x" } }, 500);
    renderTab();
    fireEvent.click(await screen.findByRole("checkbox", { name: "docs/other.md" }));
    expect(await screen.findByText(/Couldn't save the list/)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(attachedList()).getAllByRole("checkbox")).toHaveLength(3);
    });
    expect(screen.getByRole("checkbox", { name: "docs/other.md" })).not.toBeChecked();
  });

  it("AC-12: a suggestion is attached only when its Add button is pressed", async () => {
    net.get = () =>
      json(
        view({
          attachable: [{ path: "specs/07.md", kind: "specs", origin: "added" }],
          suggestions: [{ path: "specs/07.md", reason: "changed in this PR" }],
        }),
      );
    renderTab();
    expect(await screen.findByText("changed in this PR")).toBeInTheDocument();
    expect(net.puts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(net.puts).toEqual([["specs/07.md"]]));
  });
});

describe("Preview drawer (AC-7, UI-7, AC-42)", () => {
  it("shows the meta row and renders markdown with raw HTML and javascript: links neutralised", async () => {
    net.get = () => json(view({ attachable: [{ path: "specs/07.md", kind: "specs", origin: "added" }] }));
    const preview: PrContextPreview = {
      path: "specs/07.md",
      kind: "specs",
      origin: "added",
      tokens: 42,
      read_at_sha: "abcdef1234567890",
      status: "attached",
      text: "# Heading\n\n<script>window.__x=1</script>\n\n[bad](javascript:alert(1)) [ok](https://example.com)",
      read_from: "head",
    };
    net.preview = () => json(preview);
    const { baseElement } = renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "specs/07.md" }));
    expect(await screen.findByRole("heading", { name: "Heading" })).toBeInTheDocument();
    expect(screen.getByText("≈ 42 tokens")).toBeInTheDocument();
    expect(screen.getByText("at abcdef1")).toBeInTheDocument();
    expect(screen.getByText("Read at the PR head")).toBeInTheDocument();
    expect(baseElement.querySelector("script")).toBeNull();
    expect(screen.getByText("bad").closest("a")).not.toHaveAttribute("href");
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute("href", "https://example.com");
  });

  it("AC-42: a non-attached preview shows the status message instead of text", async () => {
    net.get = () => json(view({ attachable: [{ path: "docs/a.md", kind: "docs", origin: "default_branch" }] }));
    net.preview = () =>
      json({ path: "docs/a.md", kind: "docs", origin: "default_branch", tokens: 0, status: "too_large", text: null });
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "docs/a.md" }));
    expect(await screen.findByText("This document is too large to preview.")).toBeInTheDocument();
  });

  const doc = (over: Partial<PrContextPreview> = {}): PrContextPreview => ({
    path: "docs/a.md", kind: "docs", origin: "default_branch", tokens: 5, read_at_sha: null,
    status: "attached", text: "hello", read_from: "default_branch", ...over,
  });

  it("AC-7: the drawer's Attach button saves the list with the path appended; an attached document shows Attached and removes it", async () => {
    net.get = () => json(view({
      entries: [entry({ path: "specs/07.md" })],
      attachable: [{ path: "docs/a.md", kind: "docs", origin: "default_branch" }],
    }));
    net.preview = (path) => json(doc({ path }));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "docs/a.md" }));
    fireEvent.click(await screen.findByRole("button", { name: "Attach" }));
    await waitFor(() => expect(net.puts).toEqual([["specs/07.md", "docs/a.md"]]));

    cleanup();
    fireEvent.click(await (async () => { renderTab(); return screen.findByRole("button", { name: "specs/07.md" }); })());
    fireEvent.click(await screen.findByRole("button", { name: "Attached" }));
    await waitFor(() => expect(net.puts[1]).toEqual([]));
  });

  it("AC-7 / EC-14: the drawer toggle is disabled while a save is in flight", async () => {
    net.get = () => json(view({ attachable: [{ path: "docs/a.md", kind: "docs", origin: "default_branch" }] }));
    net.preview = (path) => json(doc({ path }));
    let release!: () => void;
    net.put = () => new Promise<Response>((res) => (release = () => res(json(view()))));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "docs/a.md" }));
    fireEvent.click(await screen.findByRole("button", { name: "Attach" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Attach(ed)?$/ })).toBeDisabled());
    release();
  });

  it("AC-7: at the 20-document cap the drawer's Attach is disabled", async () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry({ path: `docs/e${i}.md`, kind: "docs" }));
    net.get = () => json(view({ entries, attachable: [{ path: "docs/a.md", kind: "docs", origin: "default_branch" }] }));
    net.preview = (path) => json(doc({ path }));
    renderTab();
    fireEvent.click(await screen.findByRole("button", { name: "docs/a.md" }));
    expect(await screen.findByRole("button", { name: "Attach" })).toBeDisabled();
  });
});
