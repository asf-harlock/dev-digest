/* BlastGraph — left-to-right changed symbol → callers → endpoints flow,
   rendered through the shared MermaidDiagram (client/src/components/
   mermaid-diagram), which lazy-loads mermaid client-side. */
"use client";

import { useTranslations } from "next-intl";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import type { BlastRadius } from "@devdigest/shared";
import { toMermaid } from "../../helpers";
import { s } from "./styles";

export function BlastGraph({ blast }: { blast: BlastRadius }) {
  const t = useTranslations("blast");

  if (blast.downstream.length === 0) {
    return <div style={s.empty}>{t("graph.empty")}</div>;
  }

  return (
    <div role="img" aria-label={t("graph.ariaLabel")}>
      <MermaidDiagram chart={toMermaid(blast)} />
    </div>
  );
}
