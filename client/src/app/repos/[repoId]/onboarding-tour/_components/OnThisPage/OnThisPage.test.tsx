import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { OnThisPage } from "./OnThisPage";
import { TourSection } from "../TourSection";

const ITEMS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

let cb: IntersectionObserverCallback;
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/");
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(c: IntersectionObserverCallback) {
        cb = c;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  scrollIntoView.mockReset();
});

function Harness({ initiallyClosed = [] as string[] }) {
  const [closed, setClosed] = React.useState(new Set(initiallyClosed));
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <OnThisPage
        items={ITEMS}
        onExpand={(id) =>
          setClosed((p) => {
            const n = new Set(p);
            n.delete(id);
            return n;
          })
        }
      />
      {ITEMS.map((i) => (
        <TourSection key={i.id} id={i.id} title={i.label + " section"} icon="Boxes" open={!closed.has(i.id)} onToggle={() => {}}>
          body {i.id}
        </TourSection>
      ))}
    </NextIntlClientProvider>
  );
}

const fire = (id: string, isIntersecting: boolean) =>
  act(() => {
    cb(
      [{ target: document.getElementById(`${id}-heading`)!, isIntersecting } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });

describe("OnThisPage", () => {
  it("NFR-9: a nav named 'On this page' with exactly one aria-current link", () => {
    render(<Harness />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    expect(nav.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("aria-current", "true");
  });

  it("AC-11/13/14: click expands a collapsed target, scrolls, focuses the heading, sets the hash", () => {
    render(<Harness initiallyClosed={["c"]} />);
    expect(document.getElementById("c-panel")).toHaveAttribute("hidden");
    fireEvent.click(screen.getByRole("link", { name: "Gamma" }));
    expect(document.getElementById("c-panel")).not.toHaveAttribute("hidden");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(document.getElementById("c-heading"));
    expect(window.location.hash).toBe("#c");
    expect(screen.getByRole("link", { name: "Gamma" })).toHaveAttribute("aria-current", "true");
  });

  it("NFR-10: instant scroll under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<Harness />);
    fireEvent.click(screen.getByRole("link", { name: "Beta" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("AC-12: spy marks the heading in the top band; no hash is written before the user scrolls", () => {
    render(<Harness />);
    fire("b", true);
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute("aria-current", "true");
    expect(window.location.hash).toBe("");
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    fire("b", false);
    fire("c", true);
    expect(screen.getByRole("link", { name: "Gamma" })).toHaveAttribute("aria-current", "true");
    expect(window.location.hash).toBe("#c");
  });

  it("click-lock: the spy is ignored until scrollend, then resumes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("link", { name: "Gamma" }));
    fire("a", true); // intermediate section passing through the band
    expect(screen.getByRole("link", { name: "Gamma" })).toHaveAttribute("aria-current", "true");
    act(() => {
      window.dispatchEvent(new Event("scrollend"));
    });
    fire("a", false);
    fire("b", true);
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute("aria-current", "true");
  });

  it("AC-15: a hash on load scrolls to and marks that section", () => {
    window.history.replaceState(null, "", "/#b");
    render(<Harness />);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute("aria-current", "true");
  });
});
