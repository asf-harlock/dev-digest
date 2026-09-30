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
  const ids = React.useMemo(() => items.map((i) => i.id), [items]);
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
      flushSync(() => onExpand(id)); // a collapsed target must be open before we scroll (AC-13)
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      if (opts.focus) document.getElementById(`${id}-heading`)?.focus({ preventScroll: true });
      if (opts.writeHash) window.history.replaceState(null, "", `#${id}`);
    },
    [lock, onExpand],
  );

  // Hash on load (AC-15) — scroll instantly, no focus steal, hash already in the URL.
  React.useEffect(() => {
    const id = hashTarget(window.location.hash, ids);
    if (!id) return;
    lock();
    setActive(id);
    flushSync(() => onExpand(id));
    document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  // Scroll-spy (AC-12).
  React.useEffect(() => {
    const onScroll = () => {
      userScrolled.current = true;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", releaseLock);

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
          if (userScrolled.current) window.history.replaceState(null, "", `#${current}`);
        },
        { rootMargin: SPY_ROOT_MARGIN },
      );
      for (const id of ids) {
        const h = document.getElementById(`${id}-heading`);
        if (h) observer.observe(h);
      }
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", releaseLock);
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

export default OnThisPage;
