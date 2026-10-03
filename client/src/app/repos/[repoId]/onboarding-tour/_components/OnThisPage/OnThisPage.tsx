"use client";

import React from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "next-intl";
import { LOCK_FALLBACK_MS, SPY_ROOT_MARGIN } from "./constants";
import { firstVisible, hashTarget, prefersReducedMotion } from "./helpers";
import { s } from "./styles";

export interface OnThisPageItem {
  id: string;
  label: string;
}

/**
 * "On this page" menu with scroll-spy. Links are real `#id` anchors.
 * - click: expand a collapsed target, scroll (instant under reduced motion),
 *   focus the heading, set the hash, and lock the spy until `scrollend`
 *   so the highlight does not flicker through intermediate sections;
 * - scroll: an IntersectionObserver over the headings (top band) marks the
 *   current item and mirrors it into the URL with `replaceState` — only after
 *   the user has scrolled, so loading the page never writes a hash;
 * - load with a hash: scroll to that section and mark it.
 */
export function OnThisPage({
  items,
  onExpand,
}: {
  items: readonly OnThisPageItem[];
  /** Expand a section (no-op when already open). */
  onExpand: (id: string) => void;
}) {
  const t = useTranslations("onboarding");
  // Keyed by the id list, not the array: callers may pass a fresh array every
  // render, and re-running the spy effect per render re-creates the observer,
  // whose initial callback then loops setActive → render → replaceState.
  const idsKey = items.map((i) => i.id).join("\n");
  const ids = React.useMemo(() => (idsKey ? idsKey.split("\n") : []), [idsKey]);
  const onExpandRef = React.useRef(onExpand);
  onExpandRef.current = onExpand;
  const [active, setActive] = React.useState<string>(() => ids[0] ?? "");
  const locked = React.useRef(false);
  const userScrolled = React.useRef(false);
  const lockTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const releaseLock = React.useCallback(() => {
    locked.current = false;
    if (lockTimer.current) clearTimeout(lockTimer.current);
  }, []);
  const lock = React.useCallback(() => {
    locked.current = true;
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(releaseLock, LOCK_FALLBACK_MS);
  }, [releaseLock]);

  const goTo = React.useCallback(
    (id: string, opts: { focus: boolean; writeHash: boolean }) => {
      lock();
      setActive(id);
      // Event handler, not render: flushSync is allowed here and makes a
      // collapsed target open before we scroll to it (AC-13).
      flushSync(() => onExpandRef.current(id));
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      if (opts.focus) document.getElementById(`${id}-heading`)?.focus({ preventScroll: true });
      if (opts.writeHash) writeHash(id);
    },
    [lock],
  );

  // Hash on load (AC-15) — scroll instantly, no focus steal, hash already in the URL.
  // No flushSync inside an effect (React is mid-commit): expand, then scroll on
  // the next frame once the section has rendered open.
  React.useEffect(() => {
    const id = hashTarget(window.location.hash, ids);
    if (!id) return;
    lock();
    setActive(id);
    onExpandRef.current(id);
    const frame = requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  // Scroll-spy (AC-12).
  React.useEffect(() => {
    const onScroll = () => {
      userScrolled.current = true;
    };
    // Capture on document: the app scrolls `<main>`, not the window, and
    // scroll/scrollend do not bubble — capture sees them from any scroller.
    const opts = { capture: true, passive: true } as const;
    document.addEventListener("scroll", onScroll, opts);
    document.addEventListener("scrollend", releaseLock, opts);

    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      const visible = new Set<string>();
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const id = (e.target as HTMLElement).dataset.tourHeading;
            if (!id) continue;
            if (e.isIntersecting) visible.add(id);
            else visible.delete(id);
          }
          const current = firstVisible(ids, visible);
          if (!current || locked.current) return;
          setActive(current);
          if (userScrolled.current) writeHash(current);
        },
        { rootMargin: SPY_ROOT_MARGIN },
      );
      for (const id of ids) {
        const h = document.getElementById(`${id}-heading`);
        if (h) observer.observe(h);
      }
    }
    return () => {
      document.removeEventListener("scroll", onScroll, opts);
      document.removeEventListener("scrollend", releaseLock, opts);
      observer?.disconnect();
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, [ids, releaseLock]);

  return (
    <nav aria-label={t("tour.onThisPage")} style={s.nav}>
      <p style={s.label} aria-hidden="true">{t("tour.onThisPage")}</p>
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={isActive ? "true" : undefined}
            style={isActive ? { ...s.link, ...s.linkActive } : s.link}
            onClick={(e) => {
              e.preventDefault();
              goTo(item.id, { focus: true, writeHash: true });
            }}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

/** Mirror the section into the URL only when it changes — browsers cap
 *  `history.replaceState` at 100 calls per 10 s and throw a SecurityError. */
function writeHash(id: string): void {
  if (window.location.hash === `#${id}`) return;
  window.history.replaceState(null, "", `#${id}`);
}

export default OnThisPage;
