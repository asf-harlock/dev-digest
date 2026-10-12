/* Hooks shared by the Eval Dashboard screens. */
"use client";

import React from "react";

/**
 * Modal accessibility the vendored `Modal` does not provide: Escape closes it,
 * focus moves into it on open and returns to the opener on close (NFR-7).
 * Attach the returned ref to a `tabIndex={-1}` element wrapping the modal body.
 */
export function useModalA11y(onClose: () => void) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  React.useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    bodyRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  return bodyRef;
}
