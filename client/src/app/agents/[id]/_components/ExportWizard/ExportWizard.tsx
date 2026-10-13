"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useRepos } from "@/lib/hooks/core";
import { useCiInstallations, useCiPreview, useDownloadCiArchive, useExportCi } from "@/lib/hooks/ci";
import { useFittedModalWidth } from "@/lib/modal-width";
import { ConfigureStep } from "./_components/ConfigureStep";
import { ConfirmBar } from "./_components/ConfirmBar";
import { InstallStep, type InstallResult } from "./_components/InstallStep";
import { PreviewStep } from "./_components/PreviewStep";
import { StepIndicator } from "./_components/StepIndicator";
import { TargetStep } from "./_components/TargetStep";
import {
  DEFAULT_ACTION,
  DEFAULT_POST_AS,
  DEFAULT_TRIGGERS,
  MODAL_MAX_WIDTH,
  STEPS,
  STEP_CONFIGURE,
  STEP_INSTALL,
  STEP_PREVIEW,
  STEP_TARGET,
  type InstallAction,
  type PostAs,
  type Trigger,
} from "./constants";
import { saveBlob } from "./download-blob";
import { buildInput, findTakenBy, toggleTrigger } from "./helpers";
import { s } from "./styles";
import { useFocusTrap } from "./use-focus-trap";

export interface ExportWizardInitial {
  /** `owner/name` to start on. */
  repo: string;
  /** The repository cannot be changed (Update CI config, AC-35). */
  lockedRepo: boolean;
  triggers?: Trigger[];
  post_as?: PostAs;
}

export interface ExportWizardProps {
  agent: Agent;
  open: boolean;
  onClose: () => void;
  /** Add repository: omit. Update CI config: the installation's repo, triggers and post mode. */
  initial?: ExportWizardInitial;
}

/** A change that regenerates the workflow; held back for a confirmation while an edit exists (EC-12). */
type Change = { kind: "repo"; value: string } | { kind: "trigger"; value: Trigger } | { kind: "postAs"; value: PostAs };

/** The Export to CI dialog: Target, Preview, Configure, Install (AC-1..AC-20). Mounts its state only
 *  while `open`, so every opening starts clean. */
export function ExportWizard(props: ExportWizardProps) {
  if (!props.open || typeof document === "undefined") return null;
  return <WizardDialog agent={props.agent} onClose={props.onClose} initial={props.initial} />;
}

export default ExportWizard;

function WizardDialog({ agent, onClose, initial }: Omit<ExportWizardProps, "open">) {
  const t = useTranslations("ci");
  const width = useFittedModalWidth(MODAL_MAX_WIDTH);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const { activeRepo } = useActiveRepo();
  const repos = useRepos();
  const installations = useCiInstallations();
  const exportCi = useExportCi(agent.id);
  const archive = useDownloadCiArchive(agent.id);

  const [step, setStep] = React.useState(STEP_TARGET);
  const [repoChoice, setRepoChoice] = React.useState<string | null>(initial?.repo || null);
  const [triggers, setTriggers] = React.useState<Trigger[]>(initial?.triggers?.length ? [...initial.triggers] : [...DEFAULT_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<PostAs>(initial?.post_as || DEFAULT_POST_AS);
  const [workflowEdit, setWorkflowEdit] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<InstallAction>(DEFAULT_ACTION);
  const [result, setResult] = React.useState<InstallResult | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const [pendingChange, setPendingChange] = React.useState<Change | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);

  const locked = initial?.lockedRepo ?? false;
  const repoList = repos.data ?? [];
  const repo = repoChoice ?? activeRepo?.full_name ?? repoList[0]?.full_name ?? "";
  const takenBy = findTakenBy(installations.data, repo, agent.id);
  const pending = exportCi.isPending || archive.isPending;

  const previewInput = React.useMemo(() => buildInput({ repo, triggers, postAs }), [repo, triggers, postAs]);
  const preview = useCiPreview(agent.id, previewInput, step >= STEP_PREVIEW && !!repo && triggers.length > 0);

  useFocusTrap(rootRef, t("exportWizard.title"));

  const requestClose = React.useCallback(() => {
    if (pending) return;
    if (workflowEdit != null && !result) setConfirmClose(true);
    else onClose();
  }, [pending, workflowEdit, result, onClose]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pendingChange) setPendingChange(null);
      else if (confirmClose) setConfirmClose(false);
      else requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingChange, confirmClose, requestClose]);

  const apply = (change: Change) => {
    if (change.kind === "repo") setRepoChoice(change.value);
    else if (change.kind === "trigger") setTriggers((cur) => toggleTrigger(cur, change.value));
    else setPostAs(change.value);
    setWorkflowEdit(null);
  };
  const requestChange = (change: Change) => {
    if (workflowEdit != null) setPendingChange(change);
    else apply(change);
  };

  const goTo = (next: number) => {
    setError(null);
    setStep(next);
  };

  const install = () => {
    setError(null);
    const input = buildInput({ repo, triggers, postAs, action, workflowYaml: workflowEdit });
    if (action === "open_pr") {
      exportCi.mutate(input, {
        onSuccess: (r) => setResult({ kind: "pr", url: r.pr_url }),
        onError: setError,
      });
    } else {
      archive.mutate(input, {
        onSuccess: ({ blob, filename }) => {
          saveBlob(blob, filename);
          setResult({ kind: "zip", filename });
        },
        onError: setError,
      });
    }
  };

  const labels = STEPS.map((key) => t(`exportWizard.steps.${key}`));
  const announce = pending
    ? t("exportWizard.installing")
    : result
      ? t(result.kind === "pr" ? "exportWizard.done.prTitle" : "exportWizard.done.zipTitle")
      : t("exportWizard.stepOf", { current: step + 1, total: STEPS.length, label: labels[step] ?? "" });

  let footer: React.ReactNode;
  if (pendingChange) {
    footer = (
      <ConfirmBar
        title={t("exportWizard.confirm.regenTitle")}
        body={t("exportWizard.confirm.regenBody")}
        confirmLabel={t("exportWizard.confirm.regenConfirm")}
        cancelLabel={t("exportWizard.confirm.keep")}
        onConfirm={() => {
          apply(pendingChange);
          setPendingChange(null);
        }}
        onCancel={() => setPendingChange(null)}
      />
    );
  } else if (confirmClose) {
    footer = (
      <ConfirmBar
        title={t("exportWizard.confirm.discardTitle")}
        body={t("exportWizard.confirm.discardBody")}
        confirmLabel={t("exportWizard.confirm.discardConfirm")}
        cancelLabel={t("exportWizard.confirm.keep")}
        onConfirm={onClose}
        onCancel={() => setConfirmClose(false)}
      />
    );
  } else if (result) {
    footer = (
      <div style={s.footer}>
        <span style={s.footerSpacer} />
        <Button type="button" kind="primary" onClick={onClose}>
          {t("exportWizard.close")}
        </Button>
      </div>
    );
  } else {
    const continueDisabled =
      step === STEP_TARGET
        ? !repo || !!takenBy
        : step === STEP_PREVIEW
          ? !preview.data
          : step === STEP_CONFIGURE
            ? triggers.length === 0
            : false;
    footer = (
      <div style={s.footer}>
        {step > STEP_TARGET && (
          <Button
            type="button"
            icon="ChevronLeft"
            // Preview needs a trigger: going back to it with none would show a preview that cannot load.
            disabled={pending || (step === STEP_CONFIGURE && triggers.length === 0)}
            onClick={() => goTo(step - 1)}
          >
            {t("exportWizard.back")}
          </Button>
        )}
        <span style={s.footerSpacer} />
        {step < STEP_INSTALL ? (
          <Button type="button" kind="primary" iconRight="ArrowRight" disabled={continueDisabled} onClick={() => goTo(step + 1)}>
            {t("exportWizard.continue")}
          </Button>
        ) : (
          <Button type="button" kind="primary" icon="Check" loading={pending} disabled={pending || !repo} onClick={install}>
            {pending ? t("exportWizard.installing") : t("exportWizard.install")}
          </Button>
        )}
      </div>
    );
  }

  return createPortal(
    // The wizard may be opened from inside a card; the portal escapes its opacity/overflow/z-index and
    // stopPropagation keeps a click in the dialog from reaching the card's onClick.
    <div ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <Modal
        width={width}
        title={t("exportWizard.title")}
        subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
        onClose={requestClose}
        footer={footer}
      >
        <div role="status" aria-live="polite" style={s.srOnly}>
          {announce}
        </div>
        <div style={s.steps}>
          <StepIndicator labels={labels} step={step} />
        </div>
        <div style={s.body}>
          {step === STEP_TARGET && (
            <TargetStep
              repos={repoList}
              reposLoading={repos.isLoading}
              repo={repo}
              locked={locked}
              takenByName={takenBy?.agent_name ?? null}
              onRepoChange={(value) => requestChange({ kind: "repo", value })}
            />
          )}
          {step === STEP_PREVIEW && (
            <PreviewStep
              agentId={agent.id}
              input={previewInput}
              preview={{ data: preview.data, isLoading: preview.isLoading, error: preview.error }}
              workflowEdit={workflowEdit}
              onEditWorkflow={setWorkflowEdit}
              onRetry={() => void preview.refetch()}
            />
          )}
          {step === STEP_CONFIGURE && (
            <ConfigureStep
              triggers={triggers}
              postAs={postAs}
              onToggleTrigger={(value) => requestChange({ kind: "trigger", value })}
              onPostAs={(value) => requestChange({ kind: "postAs", value })}
            />
          )}
          {step === STEP_INSTALL && (
            <InstallStep
              repo={repo}
              fileCount={preview.data?.file_count}
              action={action}
              onAction={(value) => {
                setError(null);
                setAction(value);
              }}
              result={result}
              error={error}
              onRetry={install}
              disabled={pending}
            />
          )}
        </div>
      </Modal>
    </div>,
    document.body,
  );
}
