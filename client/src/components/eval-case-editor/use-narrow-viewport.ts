"use client";

import React from "react";
import { NARROW_QUERY } from "./constants";

function subscribe(onChange: () => void): () => void {
  const mql = typeof window !== "undefined" ? window.matchMedia?.(NARROW_QUERY) : undefined;
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

const getSnapshot = (): boolean =>
  typeof window !== "undefined" && (window.matchMedia?.(NARROW_QUERY).matches ?? false);

/** True below 768 px (EC-11). Inline styles cannot hold a media query, so the editor reads the
 *  viewport here and stacks its columns itself. The server snapshot is "wide"; where
 *  `matchMedia` does not exist (jsdom) the editor stays wide. */
export function useNarrowViewport(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}
