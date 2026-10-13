/* ci.test.tsx — Export to CI / CI Runs hooks: request shapes, stale-installation rule, archive filename. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CiInstallation } from "@devdigest/shared";
import {
  archiveFilename,
  staleInstallationIds,
  useAgentCiInstallations,
  useAutoRefreshCi,
  useCiInstallations,
  useCiRuns,
  useDownloadCiArchive,
  useExportCi,
  useRefreshCi,
} from "./ci";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function stubFetch(res: { ok?: boolean; status?: number; body?: unknown; headers?: Record<string, string>; blob?: Blob }) {
  const calls: { method: string; url: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url: String(input), body: init?.body as string | undefined });
      return {
        ok: res.ok ?? true,
        status: res.status ?? 200,
        statusText: "",
        json: async () => res.body ?? {},
        blob: async () => res.blob ?? new Blob(["zip"]),
        headers: new Headers(res.headers),
      } as Response;
    }) as unknown as typeof fetch,
  );
  return calls;
}

const input = { repo: "acme/payments-api", action: "open_pr" as const };

describe("ci hooks", () => {
  it("AC-50: useCiRuns sends only set filters", async () => {
    const calls = stubFetch({ body: [] });
    const { result } = renderHook(() => useCiRuns({ repo: "a/b", status: undefined, agent_id: "", limit: 200 }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[0]?.url).toMatch(/\/ci\/runs\?repo=a%2Fb&limit=200$/);
  });

  it("useAgentCiInstallations does not fetch without an agent id", () => {
    stubFetch({ body: [] });
    const { result } = renderHook(() => useAgentCiInstallations(null), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useExportCi posts the input and surfaces ApiError.code on failure", async () => {
    const calls = stubFetch({ ok: false, status: 409, body: { error: { code: "ci_repo_taken", message: "taken", details: { agent_name: "Other" } } } });
    const { result } = renderHook(() => useExportCi("ag1"), { wrapper: wrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toMatchObject({ status: 409, code: "ci_repo_taken" });
    });
    expect(calls[0]).toMatchObject({ method: "POST" });
    expect(calls[0]?.url).toMatch(/\/agents\/ag1\/export-ci$/);
    expect(JSON.parse(calls[0]!.body!)).toEqual(input);
  });

  it("AC-18: useDownloadCiArchive returns the blob and the server's filename, or an ApiError", async () => {
    stubFetch({ headers: { "content-disposition": 'attachment; filename="devdigest-ci-payments-api.zip"' } });
    const ok = renderHook(() => useDownloadCiArchive("ag1"), { wrapper: wrapper() });
    let out: { blob: Blob; filename: string } | undefined;
    await act(async () => {
      out = await ok.result.current.mutateAsync(input);
    });
    expect(out?.filename).toBe("devdigest-ci-payments-api.zip");
    expect(out?.blob.size).toBeGreaterThan(0);

    stubFetch({ ok: false, status: 409, body: { error: { code: "runner_bundle_missing", message: "build it" } } });
    const bad = renderHook(() => useDownloadCiArchive("ag1"), { wrapper: wrapper() });
    await act(async () => {
      await expect(bad.result.current.mutateAsync(input)).rejects.toMatchObject({ status: 409, code: "runner_bundle_missing" });
    });
  });
});

describe("ci pure helpers", () => {
  it("archiveFilename prefers the header, never a path, and falls back to the repo name", () => {
    expect(archiveFilename('attachment; filename="x.zip"', "a/b")).toBe("x.zip");
    expect(archiveFilename('attachment; filename="../x.zip"', "a/b")).toBe("devdigest-ci-b.zip");
    expect(archiveFilename(null, "acme/payments-api")).toBe("devdigest-ci-payments-api.zip");
  });

  it("AC-53: staleInstallationIds picks never-refreshed and older than 60 s", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    const mk = (id: string, last: string | null) => ({ id, last_refreshed_at: last }) as CiInstallation;
    expect(
      staleInstallationIds(
        [mk("never", null), mk("old", "2026-10-12T11:58:00Z"), mk("fresh", "2026-10-12T11:59:30Z")],
        now,
      ),
    ).toEqual(["never", "old"]);
    expect(staleInstallationIds(undefined, now)).toEqual([]);
  });
});

function inst(id: string, last: string | null): CiInstallation {
  return { id, last_refreshed_at: last } as CiInstallation;
}

describe("ci refresh hooks", () => {
  it("AC-52: useRefreshCi posts the forced request with a 60 s abort signal (EC-31)", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ url: String(input), init });
        return { ok: true, status: 200, statusText: "", json: async () => [] } as Response;
      }) as unknown as typeof fetch,
    );
    const { result } = renderHook(() => useRefreshCi(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ force: true });
    });
    expect(seen[0]!.url).toMatch(/\/ci\/refresh$/);
    expect(seen[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ force: true });
    expect(seen[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("EC-31: a timed-out refresh surfaces as an ApiError carrying the abort name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }) as unknown as typeof fetch,
    );
    const { result } = renderHook(() => useRefreshCi(), { wrapper: wrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ force: true })).rejects.toMatchObject({
        code: "network_error",
        details: { name: "TimeoutError" },
      });
    });
  });

  it("AC-63: the installation and run lists only issue GET requests", async () => {
    const calls = stubFetch({ body: [] });
    const a = renderHook(() => useCiInstallations(), { wrapper: wrapper() });
    const b = renderHook(() => useCiRuns({ limit: 50 }), { wrapper: wrapper() });
    await waitFor(() => expect(a.result.current.isSuccess && b.result.current.isSuccess).toBe(true));
    expect(calls.map((c) => c.method)).toEqual(["GET", "GET"]);
    expect(calls.some((c) => c.url.includes("/ci/refresh"))).toBe(false);
  });

  it("AC-53: useAutoRefreshCi refreshes each stale installation once, unforced, and skips fresh ones", async () => {
    const calls = stubFetch({ body: [] });
    const now = Date.now();
    const stale = new Date(now - 5 * 60_000).toISOString();
    const fresh = new Date(now - 5_000).toISOString();
    const list = [inst("never", null), inst("old", stale), inst("fresh", fresh)];
    const { result, rerender } = renderHook(() => useAutoRefreshCi(list), { wrapper: wrapper() });
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/ci/refresh"))).toHaveLength(2));
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));
    expect(calls.filter((c) => c.url.endsWith("/ci/refresh")).map((c) => JSON.parse(c.body!))).toEqual([
      { installation_id: "never", force: false },
      { installation_id: "old", force: false },
    ]);
    // A re-render with the same stale set does not refresh again.
    rerender();
    expect(calls.filter((c) => c.url.endsWith("/ci/refresh"))).toHaveLength(2);
    expect(result.current.isError).toBe(false);
  });

  it("EC-31: useAutoRefreshCi reports isError and stops at the first failing installation", async () => {
    const calls = stubFetch({ ok: false, status: 500, body: { error: { code: "internal", message: "boom" } } });
    const list = [inst("a", null), inst("b", null)];
    const { result } = renderHook(() => useAutoRefreshCi(list), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(calls.filter((c) => c.url.endsWith("/ci/refresh"))).toHaveLength(1);
  });
});
