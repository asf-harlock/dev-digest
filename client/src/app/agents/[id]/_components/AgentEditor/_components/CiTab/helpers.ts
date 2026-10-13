import type { CiInstallation } from "@devdigest/shared";

/** Props the Export wizard needs to open on an existing installation (AC-35). */
export interface WizardInitial {
  repo: string;
  lockedRepo: boolean;
  triggers?: CiInstallation["triggers"];
  post_as?: CiInstallation["post_as"];
}

/** N of the "Active in N repos" badge: installations with a run ingested (AC-37). */
export function countActive(installations: readonly CiInstallation[]): number {
  return installations.filter((i) => i.status === "active").length;
}

/** The installation "Update CI config" acts on: the selected one, else the first (Q-5). */
export function updateTarget(
  installations: readonly CiInstallation[],
  selectedId: string | null,
): CiInstallation | null {
  return installations.find((i) => i.id === selectedId) ?? installations[0] ?? null;
}

/** Wizard preset for Update CI config: repository locked, triggers and post mode as installed (AC-35). */
export function updateInitial(installation: CiInstallation): WizardInitial {
  return {
    repo: installation.repo,
    lockedRepo: true,
    triggers: installation.triggers,
    post_as: installation.post_as,
  };
}

/** Wizard preset for "+ Add repository": no repository preselected (AC-44). */
export const ADD_REPOSITORY_INITIAL: WizardInitial = { repo: "", lockedRepo: false };
