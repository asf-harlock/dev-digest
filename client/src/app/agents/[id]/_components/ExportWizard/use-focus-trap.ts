"use client";

import React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside the kit `Modal` dialog found under `rootRef`, gives it an accessible name and
 *  restores focus to whatever opened it on unmount (NFR-13). The kit renders `role="dialog"` with
 *  neither a name nor a trap, and `vendor/ui` is read-only. */
export function useFocusTrap(rootRef: React.RefObject<HTMLElement | null>, label: string): void {
  React.useEffect(() => {
    const root = rootRef.current;
    const dialog = root?.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.setAttribute("aria-label", label);
    dialog.tabIndex = -1;
    dialog.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [rootRef, label]);
}
