/* ProjectContextSection — "Project context · attached specs": one expandable
   row per document a run considered (path, tokens, origin, status). The
   expanded body is the exact stored text in a <pre> — plain text, never HTML
   (UI-6). The caller omits the section when the trace has no `project_context`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ProjectContextEntry } from "@devdigest/shared";
import { TraceSection } from "../TraceSection";
import { STATUS_COLORS } from "./constants";
import { isPrOrigin, prFirst } from "./helpers";
import { s } from "./styles";

function EntryRow({ entry }: { entry: ProjectContextEntry }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const c = STATUS_COLORS[entry.status];
  return (
    <div style={s.row}>
      <button type="button" style={s.head} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="mono" style={s.path}>
          {entry.path}
        </span>
        <span style={s.meta}>{t("trace.projectContext.tokens", { tokens: entry.tokens })}</span>
        <span className="mono" style={s.meta}>
          {isPrOrigin(entry.origin) ? t("trace.projectContext.originPr") : entry.origin}
        </span>
        <Badge color={c.color} bg={c.bg}>
          {t(`trace.projectContext.status.${entry.status}`)}
        </Badge>
        <Icon.ChevronDown size={15} style={s.chevron(open)} />
      </button>
      {open &&
        (entry.text ? (
          <pre className="mono" style={s.text}>
            {entry.text}
          </pre>
        ) : (
          <div style={s.empty}>{t("trace.projectContext.noText")}</div>
        ))}
    </div>
  );
}

export function ProjectContextSection({ entries }: { entries: ProjectContextEntry[] }) {
  const t = useTranslations("runs");
  return (
    <TraceSection
      icon="FileText"
      title={t("trace.projectContext.title")}
      right={<Badge color="var(--text-muted)">{entries.length}</Badge>}
    >
      {entries.length === 0 ? (
        <span style={s.none}>{t("trace.projectContext.none")}</span>
      ) : (
        prFirst(entries).map((e, i) => <EntryRow key={`${e.path}:${i}`} entry={e} />)
      )}
    </TraceSection>
  );
}
