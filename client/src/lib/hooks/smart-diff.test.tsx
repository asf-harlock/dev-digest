/* smart-diff.test.tsx — direct unit coverage for useSmartDiff (specs/lessons/L03),
   mirroring intent.test.tsx's fetch-mock + QueryClientProvider pattern. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSmartDiff } from "./smart-diff";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

interface Call {
  method: string;
  url: string;
}

function mockFetch(body: unknown): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(input) });
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useSmartDiff", () => {
  it("GETs /pulls/:id/smart-diff and returns the parsed groups", async () => {
    const body = {
      groups: [{ role: "core", files: [{ path: "a.ts", additions: 1, deletions: 0, finding_lines: [] }] }],
      split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
    };
    const calls = mockFetch(body);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSmartDiff("pr1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const get = calls.find((c) => c.method === "GET");
    expect(get?.url).toMatch(/\/pulls\/pr1\/smart-diff$/);
    expect(result.current.data).toEqual(body);
  });

  it("does not fetch when prId is null/undefined", () => {
    mockFetch({});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSmartDiff(null), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
