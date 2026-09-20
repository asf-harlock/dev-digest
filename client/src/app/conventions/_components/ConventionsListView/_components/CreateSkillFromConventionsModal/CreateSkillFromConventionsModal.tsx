"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { ConventionDraftGrouping } from "@devdigest/shared";
import { useDraftSkills } from "@/lib/hooks/conventions";
import { useCreateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { GroupingModeChooser } from "./_components/GroupingModeChooser";
import { DraftTabs } from "./_components/DraftTabs";
import { DraftSkillForm } from "./_components/DraftSkillForm";
import { LinkToAgentPanel } from "./_components/LinkToAgentPanel";
import { type DraftState, anySaving, savedCount, toDraftState } from "./helpers";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

/**
 * "Create skill from conventions". A single accepted candidate skips the
 * grouping picker entirely and drafts straight to the merge case, so the
 * default path looks exactly like a single-skill create; picking a
 * multi-candidate grouping mode instead produces N drafts, saved sequentially
 * so one name collision never loses the others.
 */
export function CreateSkillFromConventionsModal({
  repoId,
  repoName,
  candidateIds,
  onClose,
}: {
  repoId: string;
  repoName: string;
  candidateIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const draftSkills = useDraftSkills(repoId);
  const createSkill = useCreateSkill();

  const [grouping, setGrouping] = React.useState<ConventionDraftGrouping>("merge");
  const [drafts, setDrafts] = React.useState<DraftState[] | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const requestedRef = React.useRef(false);

  const singleCandidate = candidateIds.length === 1;

  const requestDrafts = React.useCallback(
    (mode: ConventionDraftGrouping) => {
      draftSkills.mutate(
        { candidate_ids: candidateIds, grouping: mode },
        { onSuccess: (data) => setDrafts(data.map(toDraftState)) },
      );
    },
    [candidateIds, draftSkills],
  );

  React.useEffect(() => {
    if (singleCandidate && !requestedRef.current) {
      requestedRef.current = true;
      requestDrafts("merge");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleCandidate]);

  const setDraftAt = (index: number, patch: Partial<DraftState>) => {
    setDrafts((prev) => prev?.map((d, i) => (i === index ? { ...d, ...patch } : d)) ?? prev);
  };

  const runSave = async () => {
    if (!drafts) return;
    for (let i = 0; i < drafts.length; i++) {
      if (drafts[i]!.status === "saved") continue;
      setDraftAt(i, { status: "saving", errorMessage: undefined });
      const d = drafts[i]!;
      try {
        const skill = await createSkill.mutateAsync({
          name: d.name,
          description: d.description,
          type: d.type,
          body: d.body,
          enabled: d.enabled,
          source: "extracted",
          evidence_files: d.evidenceFiles,
        });
        setDraftAt(i, { status: "saved", skillId: skill.id, version: skill.version });
      } catch (e) {
        const message = e instanceof ApiError ? e.message : undefined;
        setDraftAt(i, { status: "error", errorMessage: message });
        if (e instanceof ApiError && e.status === 409) continue;
        break;
      }
    }
  };

  const saving = anySaving(drafts ?? []);
  const closeDisabled = saving;

  let footer: React.ReactNode;
  let body: React.ReactNode;

  if (!singleCandidate && !drafts) {
    body = (
      <div style={s.body}>
        <GroupingModeChooser value={grouping} onChange={setGrouping} />
      </div>
    );
    footer = (
      <div style={s.footer}>
        <div style={s.footerLeft} />
        <div style={s.footerButtons}>
          <Button kind="ghost" onClick={onClose}>
            {t("createModal.cancel")}
          </Button>
          <Button kind="primary" onClick={() => requestDrafts(grouping)} disabled={draftSkills.isPending}>
            {t("createModal.groupingMode.continue")}
          </Button>
        </div>
      </div>
    );
  } else if (!drafts) {
    body = <div style={s.body}>{t("createModal.loadingDrafts")}</div>;
    footer = (
      <div style={s.footer}>
        <div style={s.footerLeft} />
        <div style={s.footerButtons}>
          <Button kind="ghost" onClick={onClose}>
            {t("createModal.cancel")}
          </Button>
        </div>
      </div>
    );
  } else {
    const active = drafts[activeIndex]!;
    const allSaved = drafts.every((d) => d.status === "saved");

    body = (
      <div style={s.body}>
        <div style={s.banner}>
          {t("createModal.mergedBanner", { count: candidateIds.length, repo: repoName })}
        </div>
        {drafts.length > 1 && (
          <DraftTabs
            activeIndex={activeIndex}
            statuses={drafts.map((d) => d.status)}
            onSelect={setActiveIndex}
          />
        )}
        <DraftSkillForm
          draft={active}
          onChange={(patch) => setDraftAt(activeIndex, patch)}
          disabled={active.status === "saving" || active.status === "saved"}
        />
        {allSaved && (
          <LinkToAgentPanel skillIds={drafts.filter((d) => d.skillId).map((d) => d.skillId!)} />
        )}
      </div>
    );

    if (allSaved) {
      footer = (
        <div style={s.footer}>
          <div style={s.footerLeft}>
            {drafts.length === 1
              ? t("createModal.savedHint", { version: drafts[0]!.version ?? 1 })
              : t("createModal.savedCountOf", { saved: savedCount(drafts), total: drafts.length })}
          </div>
          <div style={s.footerButtons}>
            <Button kind="primary" onClick={onClose}>
              {t("createModal.close")}
            </Button>
          </div>
        </div>
      );
    } else {
      const failed = drafts.filter((d) => d.status === "error").length;
      const primaryLabel = saving
        ? t("createModal.creating")
        : drafts.length === 1
          ? t("createModal.create")
          : failed > 0 && drafts.some((d) => d.status === "saved" || d.status === "error")
            ? t("createModal.retry", { count: drafts.length - savedCount(drafts) })
            : t("createModal.createN", { count: drafts.length });
      const started = drafts.some((d) => d.status !== "idle");

      footer = (
        <div style={s.footer}>
          <div style={s.footerLeft}>
            {started && drafts.length > 1
              ? t("createModal.savedCountOf", { saved: savedCount(drafts), total: drafts.length })
              : null}
          </div>
          <div style={s.footerButtons}>
            <Button kind="ghost" onClick={onClose} disabled={closeDisabled}>
              {t("createModal.cancel")}
            </Button>
            <Button kind="primary" icon="Sparkles" onClick={runSave} disabled={saving}>
              {primaryLabel}
            </Button>
          </div>
        </div>
      );
    }
  }

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createModal.title")}
      subtitle={drafts?.[activeIndex]?.name}
      onClose={closeDisabled ? undefined : onClose}
      footer={footer}
    >
      {body}
    </Modal>
  );
}
