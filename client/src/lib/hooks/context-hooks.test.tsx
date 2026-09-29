/* usePreviewContextFile / useRescanContext (SPEC-04) — request shape, enabled
   gating, cache keys and cache writes. fetch is stubbed; no API needed. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePreviewContextFile, useRescanContext } from "./core";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Reply = { status: number; body?: unknown } | "network";

function stubFetch(reply: (url: string, method: string) => Reply | Promise<Reply>) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      const r = await reply(url, method);
      if (r === "network") throw new TypeError("failed to fetch");
      return { ok: r.status < 400, status: r.status, statusText: "err", json: async () => r.body } as Response;
    }),
  );
  return calls;
}

const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

describe("usePreviewContextFile", () => {
  it("SPEC-04 AC-5/AC-15: GETs the file with the path URL-encoded and returns content", async () => {
    const path = "docs/my spec #1 100%.md";
    const file = { path, content: "# hi" };
    const calls = stubFetch(() => ({ status: 200, body: file }));
    const { result } = renderHook(() => usePreviewContextFile("r1", path), { wrapper: wrap(newQc()) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(file);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/repos/r1/context/file");
    expect(url.search).toBe(`?path=${encodeURIComponent(path)}`);
    expect(url.searchParams.get("path")).toBe(path); // round-trips
  });

  it("SPEC-04: is disabled (no request) when repoId or path is missing or empty", async () => {
    const calls = stubFetch(() => ({ status: 200, body: {} }));
    const qc = newQc();
    for (const [repo, path] of [[null, "a.md"], ["r1", null], ["r1", ""], [undefined, undefined]] as const) {
      const { result } = renderHook(() => usePreviewContextFile(repo, path), { wrapper: wrap(qc) });
      expect(result.current.fetchStatus).toBe("idle");
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(0);
  });

  it("SPEC-04 AC-15: surfaces 404/422 as an ApiError state without throwing", async () => {
    stubFetch((url) =>
      url.includes("missing")
        ? { status: 404, body: { error: { code: "not_found", message: "gone" } } }
        : { status: 422, body: { error: { code: "invalid_path", message: "bad" } } },
    );
    const a = renderHook(() => usePreviewContextFile("r1", "missing.md"), { wrapper: wrap(newQc()) });
    const b = renderHook(() => usePreviewContextFile("r1", "../x"), { wrapper: wrap(newQc()) });
    await waitFor(() => expect(a.result.current.isError).toBe(true));
    await waitFor(() => expect(b.result.current.isError).toBe(true));
    expect(a.result.current.error).toMatchObject({ status: 404, code: "not_found" });
    expect(b.result.current.error).toMatchObject({ status: 422, code: "invalid_path" });
    expect(a.result.current.data).toBeUndefined();
  });

  it("SPEC-04: caches per repo AND path so two documents do not share an entry", async () => {
    const calls = stubFetch((url) => ({ status: 200, body: { path: new URL(url).searchParams.get("path") } }));
    const qc = newQc();
    const a = renderHook(() => usePreviewContextFile("r1", "a.md"), { wrapper: wrap(qc) });
    const b = renderHook(() => usePreviewContextFile("r1", "b.md"), { wrapper: wrap(qc) });
    const c = renderHook(() => usePreviewContextFile("r2", "a.md"), { wrapper: wrap(qc) });
    await waitFor(() => expect(c.result.current.isSuccess && b.result.current.isSuccess).toBe(true));
    expect(a.result.current.data).toEqual({ path: "a.md" });
    expect(b.result.current.data).toEqual({ path: "b.md" });
    expect(calls).toHaveLength(3);
    expect(qc.getQueryData(["context-file", "r1", "a.md"])).toBeDefined();
    expect(qc.getQueryData(["context-file", "r1", "b.md"])).toBeDefined();
    expect(qc.getQueryData(["context-file", "r2", "a.md"])).toBeDefined();
  });
});

describe("useRescanContext", () => {
  const listing = (extra: object = {}) => ({ files: [{ path: "a.md" }], total: 1, ...extra });

  it("SPEC-04 AC-9/EC-25: POSTs rescan, exposes isPending, and writes the listing into the cache", async () => {
    let release!: (r: Reply) => void;
    const calls = stubFetch(() => new Promise<Reply>((res) => (release = res)));
    const qc = newQc();
    qc.setQueryData(["context", "r1"], listing({ files: [] , total: 0 }));
    const { result } = renderHook(() => useRescanContext(), { wrapper: wrap(qc) });

    act(() => result.current.mutate("r1"));
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(calls[0]).toMatchObject({ method: "POST" });
    expect(calls[0]!.url).toMatch(/\/repos\/r1\/context\/rescan$/);

    const fresh = listing();
    release({ status: 200, body: fresh });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(["context", "r1"])).toEqual(fresh);
    // written directly: the listing itself is not refetched
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(0);
  });

  it("SPEC-04 EC-26: a fetch_failed/timeout warning still resolves and stays in the cached listing", async () => {
    for (const warning of ["fetch_failed", "timeout"] as const) {
      stubFetch(() => ({ status: 200, body: listing({ warning }) }));
      const qc = newQc();
      const { result } = renderHook(() => useRescanContext(), { wrapper: wrap(qc) });
      await act(async () => {
        await result.current.mutateAsync("r1");
      });
      expect(result.current.isError).toBe(false);
      expect(qc.getQueryData<{ warning?: string }>(["context", "r1"])?.warning).toBe(warning);
    }
  });

  it("SPEC-04: a network error leaves the previous listing untouched", async () => {
    stubFetch(() => "network");
    const qc = newQc();
    const prev = listing();
    qc.setQueryData(["context", "r1"], prev);
    const { result } = renderHook(() => useRescanContext(), { wrapper: wrap(qc) });
    act(() => result.current.mutate("r1"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 0, code: "network_error" });
    expect(qc.getQueryData(["context", "r1"])).toBe(prev);
  });

  it("SPEC-04: a successful rescan invalidates cached previews of that repo only", async () => {
    stubFetch(() => ({ status: 200, body: listing() }));
    const qc = newQc();
    qc.setQueryData(["context-file", "r1", "a.md"], { content: "old" });
    qc.setQueryData(["context-file", "r2", "a.md"], { content: "other" });
    const { result } = renderHook(() => useRescanContext(), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync("r1");
    });
    expect(qc.getQueryState(["context-file", "r1", "a.md"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["context-file", "r2", "a.md"])?.isInvalidated).toBe(false);
  });
});
