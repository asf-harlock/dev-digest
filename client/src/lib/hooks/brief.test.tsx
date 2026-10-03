/* brief.test.tsx — useBriefGeneration (specs/06-pr-brief.md): baseline before
   POST (F12), 409 tracking, stop conditions, EC-2 / EC-6 / EC-7. The network is
   the only thing mocked; timers are fake so the 120 s give-up is testable. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { BriefResponse } from "@devdigest/shared";
import { useBriefGeneration, BRIEF_POLL_MS, BRIEF_TIMEOUT_MS } from "./brief";

function brief(over: Partial<NonNullable<BriefResponse["meta"]>> = {}, generating = false): BriefResponse {
  return {
    brief: { summary: "s", risks: [], review_focus: [] },
    meta: { generated_at: "2026-09-01T00:00:00Z", last_error_at: null, ...over },
    generating,
    stale: false,
    missing_inputs: [],
  };
}
const NO_BRIEF: BriefResponse = { brief: null, meta: null, generating: false, stale: false, missing_inputs: [] };

interface Reply {
  status: number;
  body: unknown;
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code?: string): Reply => ({
  status,
  body: { error: { code, message: `err ${status}` } },
});

const net = {
  get: ok(NO_BRIEF) as Reply,
  post: ok({ status: "running" }) as Reply,
  order: [] as string[],
  onPost: undefined as undefined | (() => void),
};

beforeEach(() => {
  vi.useFakeTimers();
  net.get = ok(NO_BRIEF);
  net.post = ok({ status: "running" });
  net.order = [];
  net.onPost = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      net.order.push(method);
      if (method === "POST") net.onPost?.();
      const r = method === "POST" ? net.post : net.get;
      return { ok: r.status < 400, status: r.status, statusText: "x", json: async () => r.body } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useBriefGeneration("pr1"), { wrapper });
  await tick(0); // initial GET
  return hook;
}
// +10 ms lets react-query's own zero-delay notify timers flush after a poll tick.
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms + 10); });

describe("useBriefGeneration", () => {
  it("SPEC-06 AC-3: captures the baseline before the POST and finishes when generated_at moves", async () => {
    net.get = ok(brief({ generated_at: "A" }));
    const { result } = await setup();
    expect(result.current.outcome).toBeNull();

    // The server finishes instantly: by the time the POST lands, the stored
    // brief already carries a new timestamp. A baseline read after the POST
    // would equal the new value and never finish.
    net.onPost = () => {
      net.get = ok(brief({ generated_at: "B" }));
    };
    act(() => result.current.start());
    await tick(0);
    expect(result.current.isGenerating).toBe(true);
    expect(net.order.filter((m) => m === "POST")).toHaveLength(1);

    await tick(BRIEF_POLL_MS);
    expect(result.current.outcome).toBe("done");
    expect(result.current.isGenerating).toBe(false);
  });

  it("SPEC-06 F12: a 409 tracks the existing run with a null baseline until generated_at appears", async () => {
    net.get = ok(NO_BRIEF); // null meta → both baseline fields null
    net.post = err(409, "conflict");
    const { result } = await setup();

    act(() => result.current.start());
    await tick(0);
    expect(result.current.isGenerating).toBe(true); // tracking, not failed
    expect(result.current.outcome).toBeNull();

    net.get = ok(brief({ generated_at: "C" }));
    await tick(BRIEF_POLL_MS);
    expect(result.current.outcome).toBe("done");
  });

  it("SPEC-06 EC-5: stops with outcome error when last_error_at changes", async () => {
    net.get = ok(brief({ generated_at: "A" }));
    const { result } = await setup();
    act(() => result.current.start());
    await tick(0);

    net.get = ok(brief({ generated_at: "A", last_error_at: "E1", last_error: "boom" }));
    await tick(BRIEF_POLL_MS);
    expect(result.current.outcome).toBe("error");
    expect(result.current.isGenerating).toBe(false);
  });

  it("SPEC-06 AC-3: keeps waiting while the server still reports generating", async () => {
    net.get = ok(brief({ generated_at: "A" }));
    const { result } = await setup();
    act(() => result.current.start());
    await tick(0);

    net.get = ok(brief({ generated_at: "B" }, true));
    await tick(BRIEF_POLL_MS * 2);
    expect(result.current.outcome).toBeNull();
    expect(result.current.isGenerating).toBe(true);
  });

  it("SPEC-06 EC-6: gives up after 120 s when nothing changes", async () => {
    net.get = ok(brief({ generated_at: "A" }));
    const { result } = await setup();
    act(() => result.current.start());
    await tick(0);

    await tick(BRIEF_TIMEOUT_MS - BRIEF_POLL_MS * 2);
    expect(result.current.outcome).toBeNull();
    await tick(BRIEF_POLL_MS * 3);
    expect(result.current.outcome).toBe("timeout");
    expect(result.current.isGenerating).toBe(false);
  });

  it("SPEC-06 EC-7: stops after the first failed re-read", async () => {
    net.get = ok(brief({ generated_at: "A" }));
    const { result } = await setup();
    act(() => result.current.start());
    await tick(0);

    net.get = err(500);
    await tick(BRIEF_POLL_MS * 3); // tick 1 fails the read, tick 2 notices
    expect(result.current.outcome).toBe("poll_failed");
    expect(result.current.isGenerating).toBe(false);
    const gets = net.order.filter((m) => m === "GET").length;
    await tick(BRIEF_POLL_MS * 5);
    expect(net.order.filter((m) => m === "GET").length).toBe(gets); // no more polling
  });

  it("SPEC-06 EC-2: a config_error POST failure sets the config_error outcome and does not poll", async () => {
    net.post = err(400, "config_error");
    const { result } = await setup();
    act(() => result.current.start());
    await tick(0);

    expect(result.current.outcome).toBe("config_error");
    expect(result.current.isGenerating).toBe(false);
    const gets = net.order.filter((m) => m === "GET").length;
    await tick(BRIEF_POLL_MS * 3);
    expect(net.order.filter((m) => m === "GET").length).toBe(gets);
  });
});
