"use client";

import React from "react";
import { Icon, type IconName } from "@devdigest/ui";
import { s } from "./styles";

/**
 * One collapsible tour section. The `<section id>` is the scroll/hash target;
 * the `h2` is focusable (`tabIndex=-1`) so the menu can move focus to it
 * (AC-14); the button inside it carries `aria-expanded` (AC-16).
 */
export function TourSection({
  id,
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const Ico = Icon[icon];
  const panelId = `${id}-panel`;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} style={s.section}>
      <h2 id={`${id}-heading`} tabIndex={-1} data-tour-heading={id} style={s.heading}>
        <button type="button" style={s.toggle} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          <span style={s.iconBox} aria-hidden="true">
            <Ico size={16} />
          </span>
          <span style={s.title}>{title}</span>
          {open ? <Icon.ChevronDown size={16} aria-hidden="true" /> : <Icon.ChevronRight size={16} aria-hidden="true" />}
        </button>
      </h2>
      <div id={panelId} hidden={!open} style={s.panel}>
        {children}
      </div>
    </section>
  );
}

export default TourSection;
