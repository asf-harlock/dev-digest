/* modal-width.ts — a width for the kit `Modal` that never exceeds the viewport. The kit centres its
   dialog in a `place-items: center` grid with an auto column, so the dialog's `maxWidth: 100%`
   resolves against a track that grows to the content and is ignored: a fixed numeric `width` wins
   and a 1080px dialog overflows a 768px screen (SPEC-10 NFR-11, EC-11). `vendor/ui` is read-only,
   so callers pass this value as `width` instead. */
"use client";

import React from "react";

/** The kit's padding on each side of the dialog (`Modal.tsx`: `padding: 28`). */
export const MODAL_VIEWPORT_MARGIN = 28;

/** `max`, or what fits between the kit's margins when the viewport is narrower. Pure. */
export function fitModalWidth(max: number, viewportWidth: number): number {
  return Math.max(0, Math.min(max, viewportWidth - 2 * MODAL_VIEWPORT_MARGIN));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const getSnapshot = (): number => window.innerWidth;
/** Server snapshot: no viewport — the caller's `max` is used. */
const getServerSnapshot = (): number => Number.POSITIVE_INFINITY;

/** The `Modal` width for a dialog that wants `max` px: `min(max, innerWidth - 56)`, following resizes. */
export function useFittedModalWidth(max: number): number {
  const viewport = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return fitModalWidth(max, viewport);
}
