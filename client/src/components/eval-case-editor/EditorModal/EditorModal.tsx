"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton, TextInput } from "@devdigest/ui";
import type { EvalCaseDetail, EvalCaseDraft, EvalCaseDraftOwner } from "@devdigest/shared";
import {
  useCreateAgentEvalCase,
  useCreateEvalCaseFromFinding,
  useUpdateEvalCase,
} from "@/lib/hooks/eval";
import { useCreateSkillCaseFromFinding, useCreateSkillEvalCase } from "@/lib/hooks/skill-eval";
import { MODAL_WIDTH, PROBLEM_KEYS, REJECTION_KEYS, type SaveRejectionCode } from "../constants";
import {
  bannerFacts,
  buildCaseInput,
  buildCaseUpdate,
  draftFromCase,
  draftFromSeed,
  draftProblems,
  editorMode,
  emptyDraft,
  expectedProblem,
  firstFreeOwner,
  hasUpdate,
  isDirty,
  ownerEvalsTabHref,
  ownerKey,
  parseExpectedOutput,
  showsBeforeTouch,
  skeletonText,
  type CaseDraft,
  type DraftField,
} from "../helpers";
import { s } from "../styles";
import { useEscapeKey } from "../use-escape-key";
import { useNarrowViewport } from "../use-narrow-viewport";
import { ActualOutputPane } from "../ActualOutputPane";
import { DiscardDialog } from "../DiscardDialog";
import { ExpectedOutputPane } from "../ExpectedOutputPane";
import { Field, controlProps } from "../Field";
import { InputTabs } from "../InputTabs";
import { OwnerPicker } from "../OwnerPicker";
import { TypeBanner } from "../TypeBanner";

export interface CaseOwner {
  kind: "agent" | "skill";
  id: string;
}

/** The seed of a Case Editor opened from a finding (AC-1): the draft the server built, the
 *  finding it came from and the PR whose case links a save refreshes. */
export interface CaseSeed {
  findingId: string;
  pullId?: string | null;
  draft: EvalCaseDraft;
}

type Outcome = { kind: "saved" } | { kind: "exists" } | { kind: "rejected"; code: SaveRejectionCode };

/** A finding route answers `created`, `exists` or `rejected`; the editor only tells them apart. */
function fromFindingRoute(r: { kind: "created" | "exists" } | { kind: "rejected"; code: SaveRejectionCode }): Outcome {
  if (r.kind === "rejected") return r;
  return r.kind === "exists" ? { kind: "exists" } : { kind: "saved" };
}

/** The editor dialog. It stays mounted from "loading" to "loaded" so the dialog element
 *  does not change under the user. `c` is null for a new case, a seeded draft and while a
 *  stored case loads (`load`); the draft is the user's edits laid over the stored or seeded
 *  values, so there is nothing to reset when the case arrives. Runs the save. A seeded draft
 *  is created, at the chosen owner, only by **Save** (AC-1, AC-6). */
export function EditorModal({
  owner,
  seed = null,
  c,
  load = "ready",
  onClose,
  onSaved,
  onRequestDelete,
  escapeEnabled,
}: {
  /** The tab's owner for a new or stored case; null for a seeded draft (the picker chooses). */
  owner: CaseOwner | null;
  seed?: CaseSeed | null;
  c: EvalCaseDetail | null;
  load?: "ready" | "loading" | "error";
  onClose: () => void;
  /** A save created the case (not called for a rename or an edit). */
  onSaved?: () => void;
  onRequestDelete?: (caseId: string, name: string) => void;
  escapeEnabled: boolean;
}) {
  const t = useTranslations("eval");
  const narrow = useNarrowViewport();
  const mode = editorMode(c);
  const locked = mode === "finding";
  const initial = React.useMemo<CaseDraft>(
    () => (c ? draftFromCase(c) : seed ? draftFromSeed(seed.draft) : emptyDraft()),
    [c, seed],
  );
  const [edits, setEdits] = React.useState<Partial<CaseDraft>>({});
  const draft = React.useMemo<CaseDraft>(() => ({ ...initial, ...edits }), [initial, edits]);
  const [touched, setTouched] = React.useState<ReadonlySet<DraftField>>(new Set());
  const [rejection, setRejection] = React.useState<SaveRejectionCode | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);
  /** Owners that turned out to have a case since the draft was read (EC-5). */
  const [takenOwners, setTakenOwners] = React.useState<readonly EvalCaseDraftOwner[]>([]);
  const taken = React.useMemo<ReadonlySet<string>>(() => new Set(takenOwners.map(ownerKey)), [takenOwners]);

  const owners = React.useMemo(() => seed?.draft.owners ?? [], [seed]);
  const isFree = (o: EvalCaseDraftOwner) => !o.has_case && !taken.has(ownerKey(o));
  // The picked owner while it is still free; none after it turned out to have a case (EC-5),
  // so a second click on Save cannot silently go to another owner. Untouched: the first free one.
  const chosen = seed
    ? picked === null
      ? firstFreeOwner(owners.filter(isFree))
      : (owners.find((o) => ownerKey(o) === picked && isFree(o)) ?? null)
    : null;
  const target: CaseOwner | null = chosen ? { kind: chosen.kind, id: chosen.id } : owner;

  const createAgent = useCreateAgentEvalCase(target?.kind === "agent" ? target.id : null);
  const createSkill = useCreateSkillEvalCase(target?.kind === "skill" ? target.id : null);
  const createFromFinding = useCreateEvalCaseFromFinding(seed?.pullId);
  const createSkillFromFinding = useCreateSkillCaseFromFinding(seed?.findingId);
  const update = useUpdateEvalCase();
  const pending =
    createAgent.isPending ||
    createSkill.isPending ||
    createFromFinding.isPending ||
    createSkillFromFinding.isPending ||
    update.isPending;

  const problems = draftProblems(draft, mode);
  const expected = expectedProblem(draft, mode);
  const errors: Partial<Record<DraftField, string>> = {};
  for (const field of Object.keys(problems) as DraftField[]) {
    const problem = problems[field];
    if (!problem || !(touched.has(field) || showsBeforeTouch(problem))) continue;
    const key = (PROBLEM_KEYS[field] as Partial<Record<string, string>>)[problem];
    if (key) errors[field] = t(key);
  }
  const hasVisibleError = Object.keys(errors).length > 0;
  const dirty = isDirty(draft, initial);
  const facts = React.useMemo(() => bannerFacts(draft.expected), [draft.expected]);

  const set = <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setRejection(null);
  };
  const touch = (field: DraftField) => setTouched((prev) => new Set(prev).add(field));

  const requestClose = React.useCallback(() => {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  }, [dirty, onClose]);
  useEscapeKey(escapeEnabled && !confirmingDiscard, requestClose);

  const canSave = !pending && !hasVisibleError && expected === null && (seed ? target !== null : dirty);

  const save = () => {
    if (pending) return;
    if (seed ? target === null : !dirty) return;
    if (Object.keys(problems).length > 0) {
      setTouched(new Set(Object.keys(problems) as DraftField[]));
      return;
    }
    if (expected !== null) return;
    const parsed = parseExpectedOutput(draft.expected, draft.type);
    const done = (result: Outcome) => {
      if (result.kind === "rejected") setRejection(result.code);
      else if (result.kind === "exists") {
        const hit = owners.find((o) => target && ownerKey(o) === ownerKey(target));
        if (hit) {
          setTakenOwners((prev) => [...prev, hit]);
          setPicked(ownerKey(hit)); // stays picked (now disabled), so Save cannot go to another owner unasked
        }
      } else {
        if (!c) onSaved?.();
        onClose();
      }
    };
    if (c) {
      const body = buildCaseUpdate(draft, initial, mode, parsed.ok ? parsed.expectation : null);
      // Nothing the server would act on (it answers an empty PATCH with a 422): close, send nothing.
      if (!hasUpdate(body)) onClose();
      else update.mutate({ caseId: c.id, update: body }, { onSuccess: done });
      return;
    }
    if (!parsed.ok || !target) return;
    const input = buildCaseInput(draft, parsed.expectation);
    if (seed) {
      if (target.kind === "agent") {
        createFromFinding.mutate({ findingId: seed.findingId, input }, { onSuccess: (r) => done(fromFindingRoute(r)) });
      } else {
        createSkillFromFinding.mutate({ skillId: target.id, input }, { onSuccess: (r) => done(fromFindingRoute(r)) });
      }
      return;
    }
    (target.kind === "agent" ? createAgent : createSkill).mutate(input, { onSuccess: done });
  };

  const title = c
    ? t("caseModal.title", { name: c.name })
    : load === "ready"
      ? t("caseEditor.createTitle")
      : t("caseModal.loading");
  const subtitle = seed ? (
    <div style={s.subtitleBlock}>
      <span>
        {seed.draft.expectation.type === "must_find"
          ? t("caseEditor.subtitle.seededAccepted")
          : t("caseEditor.subtitle.seededDismissed")}
      </span>
      <OwnerPicker
        owners={owners}
        taken={taken}
        value={chosen ? ownerKey(chosen) : null}
        onChange={(key) => {
          setPicked(key);
          setRejection(null);
        }}
      />
    </div>
  ) : (
    t("caseEditor.subtitle.default")
  );
  // The "already has a case" message belongs to the owner that returned it: it hides once another is picked.
  const lastTaken = takenOwners[takenOwners.length - 1] ?? null;
  const takenOwner = lastTaken && picked === ownerKey(lastTaken) ? lastTaken : null;
  const fill = s.fill(narrow);

  const footer =
    load !== "ready" ? undefined : (
      <div style={s.footerWrap}>
        {/* Result banner slot (Phase B fills it): fixed above the buttons, outside both columns (AC-23). */}
        <div role="status" aria-live="polite" data-slot="result-banner" style={s.bannerSlot} />
        {rejection && (
          <div role="alert" style={s.rejection}>
            {t(REJECTION_KEYS[rejection])}
          </div>
        )}
        {takenOwner && (
          <div role="alert" style={s.rejection}>
            {t("caseEditor.exists")}{" "}
            <Link href={ownerEvalsTabHref(takenOwner)} style={s.link}>
              {t("caseEditor.existsLink", { name: takenOwner.name })}
            </Link>
          </div>
        )}
        <div style={s.footer}>
          {c && onRequestDelete && (
            <Button kind="danger" icon="Trash" onClick={() => onRequestDelete(c.id, c.name)}>
              {t("caseModal.delete.action")}
            </Button>
          )}
          <span style={s.spacer} />
          <Button kind="secondary" onClick={requestClose}>
            {t("caseEditor.cancel")}
          </Button>
          <Button kind="primary" loading={pending} disabled={!canSave} onClick={save}>
            {pending ? t("caseModal.saving") : t("caseModal.save")}
          </Button>
        </div>
      </div>
    );

  return (
    <>
      <Modal width={MODAL_WIDTH} title={title} subtitle={subtitle} onClose={requestClose} footer={footer}>
        {load === "loading" ? (
          <div style={s.loading}>
            <Skeleton height={32} />
            <Skeleton height={160} />
          </div>
        ) : load === "error" ? (
          <div role="alert" style={s.error}>
            {t("caseModal.loadError")}
          </div>
        ) : (
          <form
            style={s.body(narrow)}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div style={s.column(narrow)}>
              <TypeBanner type={draft.type} facts={facts} editable={!locked} onTypeChange={(type) => set("type", type)} />
              {locked && <p style={s.note}>{t("caseEditor.findingNote")}</p>}
              <div style={s.pair}>
                <Field id="case-name" label={t("caseEditor.fields.name")} required error={errors.name}>
                  <TextInput
                    {...controlProps("case-name", errors.name, true)}
                    value={draft.name}
                    placeholder={t("caseModal.namePlaceholder")}
                    onChange={(v) => set("name", v)}
                    onBlur={() => touch("name")}
                  />
                </Field>
                <Field id="case-notes" label={t("caseEditor.fields.notes")} error={errors.notes}>
                  <textarea
                    {...controlProps("case-notes", errors.notes)}
                    style={{ ...s.control, ...s.textarea }}
                    rows={1}
                    value={draft.notes}
                    placeholder={t("caseEditor.fields.notesPlaceholder")}
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </Field>
              </div>
              <InputTabs
                draft={draft}
                expectedFile={facts?.file ?? null}
                readOnly={locked}
                narrow={narrow}
                errors={errors}
                c={c}
                set={set}
                touch={touch}
              />
            </div>
            <div style={{ ...s.column(narrow), ...(narrow ? s.columnDividerStacked : s.columnDivider) }}>
              <ExpectedOutputPane
                value={draft.expected}
                problem={expected}
                readOnly={locked}
                fillStyle={fill}
                onChange={(v) => set("expected", v)}
                onSkeleton={() => set("expected", skeletonText(draft.diff))}
              />
              <ActualOutputPane findings={c?.latest_result?.findings} fillStyle={fill} />
            </div>
          </form>
        )}
      </Modal>
      {confirmingDiscard && (
        <DiscardDialog onKeep={() => setConfirmingDiscard(false)} onDiscard={onClose} />
      )}
    </>
  );
}
