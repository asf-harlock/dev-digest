"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { TourArchitecture } from "@devdigest/shared";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { buildDiagramSource } from "./helpers";
import { s } from "./styles";

/** Prose (raw HTML renders as literal text — EC-23) plus a diagram of grounded nodes/edges. */
export function ArchitectureSection({ section }: { section: TourArchitecture | undefined }) {
  const t = useTranslations("onboarding");
  const diagram = React.useMemo(() => (section ? buildDiagramSource(section) : null), [section]);
  if (!section || (!section.body.trim() && !diagram)) {
    return <p style={s.empty}>{t("tour.empty.architecture")}</p>;
  }
  return (
    <div>
      <div style={s.body}>
        <Markdown>{section.body}</Markdown>
      </div>
      {diagram && (
        <div style={s.diagram} role="img" aria-label={t("tour.architecture.diagramLabel")}>
          <MermaidDiagram chart={diagram} />
        </div>
      )}
    </div>
  );
}

export default ArchitectureSection;
