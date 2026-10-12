"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton, TextInput } from "@devdigest/ui";
import type { EvalCaseDetail, EvalCaseDraft, EvalCaseDraftOwner } from "@devdigest/shared";
import { RunDialog } from "@/components/carrier-run-dialog";
import {
  useCreateAgentEvalCase,
  useCreateEvalCaseFromFinding,
  useUpdateEvalCase,
  type SaveEvalCaseResult,
} from "@/lib/hooks/eval";
import { useCreateSkillCaseFromFinding, useCreateSkillEvalCase } from "@/lib/hooks/skill-eval";
import { useSkill } from "@/lib/hooks/skills";
import { useFittedModalWidth } from "@/lib/modal-width";
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
  RUN_CASE_HINT_KEY,
  runCaseBlock,
  showsBeforeTouch,
  skeletonText,
  type CaseDraft,
  type CaseOwner,
  type DraftField,
} from "../helpers";
import { s } from "../styles";
import { useEscapeKey } from "../use-escape-key";
import { useCaseRun } from "../use-case-run";
import { useNarrowViewport } from "../use-narrow-viewport";
import { ActualOutputPane } from "../ActualOutputPane";
import { DiscardDialog } from "../DiscardDialog";
import { ExpectedOutputPane } from "../ExpectedOutputPane";
import { Field, controlProps } from "../Field";
import { InputTabs } from "../InputTabs";
import { OwnerPicker } from "../OwnerPicker";
import { CaseRunStatus } from "../CaseRunStatus";
import { ResultBanner } from "../ResultBanner";
import { RunOnSaveToggle } from "../RunOnSaveToggle";
import { TypeBanner } from "../TypeBanner";

export type { CaseOwner };

/** The seed of a Case Editor opened from a finding (AC-1): the draft the server built, the
 *  finding it came from and the PR whose case links a save refreshes. */
export interface CaseSeed {
  findingId: string;
  pullId?: string | null;
  draft: EvalCaseDraft;
}

type Outcome = { kind: "saved"; caseId: string } | { kind: "exists" } | { kind: "rejected"; code: SaveRejectionCode };

/** A finding route answers `created`, `exists` or `rejected`; the editor only tells them apart. */
function fromFindingRoute(
  r: { kind: "created"; caseId: string } | { kind: "exists" } | { kind: "rejected"; code: SaveRejectionCode },
): Outcome {
  if (r.kind === "rejected") return r;
  return r.kind === "exists" ? { kind: "exists" } : { kind: "saved", caseId: r.caseId };
}

/** A case write answers the saved case (its id is the NEW one after a replace, SPEC-09 AC-15) or a rejection. */
function fromCaseWrite(r: SaveEvalCaseResult): Outcome {
  return r.kind === "rejected" ? r : { kind: "saved", caseId: r.case.id };
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
  onStay,
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
  /** A save with **Run on save** on keeps the editor open on the saved case (AC-45, AC-51): the
   *  caller switches to it (its id is a new one after a replace) with the owner it belongs to. */
  onStay?: (caseId: string, owner: CaseOwner) => void;
  onRequestDelete?: (caseId: string, name: string) => void;
  escapeEnabled: boolean;
}) {
  const t = useTranslations("eval");
  const narrow = useNarrowViewport();
  // The kit Modal ignores `maxWidth` here, so the width itself must fit the viewport (NFR-11, EC-11).
  const modalWidth = useFittedModalWidth(MODAL_WIDTH);
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

  /** Whose case this is: the stored case's owner, else where a save would put it. */
  const runOwner: CaseOwner | null = c ? { kind: c.owner_kind, id: c.owner_id } : target;
  const caseRun = useCaseRun(runOwner);
  const [runOnSave, setRunOnSave] = React.useState(false);
  /** The case the carrier dialog is open for (a skill-owned case), or null. */
  const [carrierCaseId, setCarrierCaseId] = React.useState<string | null>(null);
  const closeCarrier = React.useCallback(() => setCarrierCaseId(null), []);
  const carrierSkill = useSkill(carrierCaseId !== null && runOwner?.kind === "skill" ? runOwner.id : null);

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
  // The discard confirmation and the carrier dialog are stacked on top: Escape closes only the top one.
  useEscapeKey(escapeEnabled && !confirmingDiscard && carrierCaseId === null, requestClose);

  const canSave = !pending && !hasVisibleError && expected === null && (seed ? target !== null : dirty);

  /** A save succeeded. Without **Run on save** the editor closes; with it the editor stays on the
   *  saved case and starts the run: straight away for an agent-owned case, after the carrier
   *  dialog for a skill-owned one (cancelling it keeps the saved case, EC-31). A rejected or failed
   *  save never gets here, so it starts nothing (EC-16). */
  const finish = (savedId: string, created: boolean) => {
    if (created) onSaved?.();
    if (!runOnSave || !runOwner) {
      onClose();
      return;
    }
    setEdits({});
    setTouched(new Set());
    setRejection(null);
    onStay?.(savedId, runOwner);
    if (runOwner.kind === "agent") caseRun.startAgentCase(savedId);
    else setCarrierCaseId(savedId);
  };

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
        finish(result.caseId, !c);
      }
    };
    if (c) {
      const body = buildCaseUpdate(draft, initial, mode, parsed.ok ? parsed.expectation : null);
      // Nothing the server would act on (it answers an empty PATCH with a 422): close, send nothing.
      if (!hasUpdate(body)) {
        if (runOnSave) finish(c.id, false);
        else onClose();
      } else update.mutate({ caseId: c.id, update: body }, { onSuccess: (r) => done(fromCaseWrite(r)) });
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
    (target.kind === "agent" ? createAgent : createSkill).mutate(input, { onSuccess: (r) => done(fromCaseWrite(r)) });
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

  const runBlock = runCaseBlock({ stored: !!c, dirty, busy: caseRun.busyLive, noAgent: caseRun.noAgent });
  const runHint = runBlock ? t(`caseRun.hints.${RUN_CASE_HINT_KEY[runBlock]}`) : null;
  const caseRunning = !!c && caseRun.runningCaseId === c.id && !caseRun.stalled;
  const runCase = () => {
    if (!c || runBlock !== null) return;
    if (c.owner_kind === "agent") caseRun.startAgentCase(c.id);
    else setCarrierCaseId(c.id);
  };

  const footer =
    load !== "ready" ? undefined : (
      <div style={s.footerWrap}>
        {/* Result banner slot: fixed above the buttons, outside both columns (AC-23, AC-43). */}
        <div role="status" aria-live="polite" data-slot="result-banner" style={s.bannerSlot}>
          <ResultBanner running={caseRunning} latest={c?.latest_result} />
          {/* EC-23, EC-24: the timeout sentence and the failed-poll message with Retry, inside this live
              region (no second one) and above the buttons — the modal can be open with no tab behind it. */}
          {caseRun.stalled && (
            <div style={s.stalled}>
              <CaseRunStatus flow={caseRun} live={false} />
            </div>
          )}
        </div>
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
            <Button type="button" kind="danger" icon="Trash" onClick={() => onRequestDelete(c.id, c.name)}>
              {t("caseModal.delete.action")}
            </Button>
          )}
          <span style={s.spacer}>
            {runHint && (
              <span id="run-case-hint" style={s.runHint}>
                {runHint}
              </span>
            )}
          </span>
          <RunOnSaveToggle
            on={runOnSave}
            onChange={setRunOnSave}
            disabledReason={caseRun.noAgent ? t("caseRun.hints.noAgent") : undefined}
          />
          <Button type="button" kind="secondary" onClick={requestClose}>
            {t("caseEditor.cancel")}
          </Button>
          <span title={runHint ?? undefined}>
            <Button
              type="button"
              kind="secondary"
              icon="Play"
              disabled={runBlock !== null}
              aria-describedby={runHint ? "run-case-hint" : undefined}
              onClick={runCase}
            >
              {t("caseRun.runCase")}
            </Button>
          </span>
          <Button type="button" kind="primary" loading={pending} disabled={!canSave} onClick={save}>
            {pending ? t("caseModal.saving") : t("caseModal.save")}
          </Button>
        </div>
      </div>
    );

  return (
    <>
      <Modal width={modalWidth} title={title} subtitle={subtitle} onClose={requestClose} footer={footer}>
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
      {carrierCaseId !== null && carrierSkill.data && caseRun.skillOverview && (
        <RunDialog
          skill={carrierSkill.data}
          overview={caseRun.skillOverview}
          caseId={carrierCaseId}
          confirmDisabled={caseRun.busyLive}
          onClose={closeCarrier}
          onStarted={(runId) => caseRun.onStarted(runId, carrierCaseId)}
        />
      )}
    </>
  );
}
