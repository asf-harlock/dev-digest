/* useSaveAgentContext / useSaveSkillContext (SPEC-04) — optimistic update,
   rollback (EC-22), refetch only when the last save settles (EC-24).
   One file for both hooks: they share one contract. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSaveAgentContext } from "./agents";
import { useSaveSkillContext } from "./skills";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface Pending {
  method: string;
  url: string;
  resolve: (status: number, body?: unknown) => void;
}

/** fetch stub: PUTs stay pending until the test settles them; GETs succeed. */
function stubFetch() {
  const puts: Pending[] = [];
  const gets: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        gets.push(String(input));
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response);
      }
      return new Promise<Response>((res) =>
        puts.push({
          method,
          url: String(input),
          resolve: (status, body) =>
            res({ ok: status < 400, status, statusText: "err", json: async () => body } as Response),
        }),
      );
    }),
  );
  return { puts, gets };
}

const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const cases = [
  { name: "useSaveAgentContext", use: useSaveAgentContext, key: "agent", url: /\/agents\/x1\/context$/ },
  { name: "useSaveSkillContext", use: useSaveSkillContext, key: "skill", url: /\/skills\/x1\/context$/ },
] as const;

describe.each(cases)("$name", ({ use, key, url }) => {
  it("EC-22: updates the cache optimistically, PUTs the full list, and rolls back on error", async () => {
    const { puts } = stubFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData([key, "x1"], { id: "x1", context_paths: ["a.md"] });
    qc.setQueryDefaults([key, "x1"], { queryFn: () => new Promise(() => {}) });
    const { result } = renderHook(() => use(), { wrapper: wrap(qc) });

    act(() => result.current.mutate({ id: "x1", paths: ["a.md", "b.md"] }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]!.url).toMatch(url);
    expect(qc.getQueryData<{ context_paths: string[] }>([key, "x1"])?.context_paths).toEqual(["a.md", "b.md"]);

    puts[0]!.resolve(500, { error: { code: "boom", message: "boom" } });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<{ context_paths: string[] }>([key, "x1"])?.context_paths).toEqual(["a.md"]);
  });

  it("EC-24: with two saves in flight only the last to settle refetches", async () => {
    const { puts } = stubFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData([key, "x1"], { id: "x1", context_paths: [] });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => use(), { wrapper: wrap(qc) });

    act(() => result.current.mutate({ id: "x1", paths: ["a.md"] }));
    await waitFor(() => expect(puts).toHaveLength(1));
    act(() => result.current.mutate({ id: "x1", paths: ["a.md", "b.md"] }));
    await waitFor(() => expect(puts).toHaveLength(2));

    puts[0]!.resolve(200, { id: "x1", context_paths: ["a.md"] });
    await new Promise((r) => setTimeout(r, 20));
    expect(invalidate).not.toHaveBeenCalled();

    puts[1]!.resolve(200, { id: "x1", context_paths: ["a.md", "b.md"] });
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(qc.getQueryData<{ context_paths: string[] }>([key, "x1"])?.context_paths).toEqual(["a.md", "b.md"]);
  });
});
