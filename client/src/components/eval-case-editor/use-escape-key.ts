"use client";

import React from "react";

/** Calls `onEscape` on every Escape keydown while `enabled`. A stacked dialog turns the
 *  one underneath off (`enabled = false`) so Escape closes only the top one. */
export function useEscapeKey(enabled: boolean, onEscape: () => void): void {
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onEscape]);
}
