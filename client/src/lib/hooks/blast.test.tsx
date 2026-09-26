/* blast.test.tsx — direct unit coverage for useBlastRadius (specs/lessons/L04),
   mirroring smart-diff.test.tsx's fetch-mock + QueryClientProvider pattern. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useBlastRadius } from "./blast";

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

describe("useBlastRadius", () => {
  it("GETs /pulls/:id/blast and returns the parsed map", async () => {
    const body = {
      changed_symbols: [{ name: "createUser", file: "users.ts", kind: "function" }],
      downstream: [
        {
          symbol: "createUser",
          callers: [{ name: "handler", file: "routes/users.ts", line: 10 }],
          endpoints_affected: ["POST /users"],
          crons_affected: [],
        },
      ],
      summary: "1 changed symbol · 1 caller · 1 endpoint",
    };
    const calls = mockFetch(body);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBlastRadius("pr1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const get = calls.find((c) => c.method === "GET");
    expect(get?.url).toMatch(/\/pulls\/pr1\/blast$/);
    expect(result.current.data).toEqual(body);
  });

  it("does not fetch when prId is null/undefined", () => {
    mockFetch({});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBlastRadius(null), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
