"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { PreviewTab } from "./_components/PreviewTab";
import { EvalsTab } from "./_components/EvalsTab";
import { RunDialog } from "./_components/RunDialog";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";
import { runHintKey, useSkillEvalFlow } from "./use-skill-eval-flow";

/**
 * Skill editor — header (name, type/source badges, the "Run on evals" button) + the
 * five-tab shell. The button lives here, not inside `EvalsTab`, per the mockup; it opens
 * the same run dialog as the tab's "Run all evals" and shares its disabled reasons
 * (EC-11, EC-13, AC-33), so the run state is owned here (use-skill-eval-flow.ts).
 */
export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const flow = useSkillEvalFlow(skill.id);
  const hintKey = runHintKey(flow.block);
  const runHint = hintKey ? t(`evals.runHint.${hintKey}`) : undefined;
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.wrap}>
      {skill.injection_flagged && (
        <div style={s.injectionBanner} role="alert">
          <Icon.Shield size={16} style={{ color: "var(--crit)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={s.injectionBannerTitle}>{t("editor.injectionBanner.title")}</span>
            <span style={s.injectionBannerBody}>{t("editor.injectionBanner.body")}</span>
          </div>
        </div>
      )}
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 style={s.h1} className="mono">
          {skill.name}
        </h1>
        <Badge icon="GitCommit" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        {skill.source !== "manual" && (
          <Badge icon="Upload" color="var(--text-secondary)">
            {t(`listItem.source.${skill.source}`)}
          </Badge>
        )}
        {skill.injection_flagged && (
          <Badge icon="Shield" color="var(--crit)" bg="var(--crit-bg)">
            {t("editor.injectionBadge")}
          </Badge>
        )}
        {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
        <div style={{ marginLeft: "auto" }}>
          <span title={runHint}>
            <Button
              kind="secondary"
              size="sm"
              icon="FlaskConical"
              disabled={flow.block !== null}
              onClick={flow.openDialog}
            >
              {t("evals.runOnEvals")}
            </Button>
          </span>
        </div>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "context" && <ContextTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "evals" && <EvalsTab skill={skill} flow={flow} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
      {flow.dialogOpen && flow.overview.data && (
        <RunDialog
          skill={skill}
          overview={flow.overview.data}
          onClose={flow.closeDialog}
          onStarted={flow.onStarted}
        />
      )}
    </div>
  );
}
