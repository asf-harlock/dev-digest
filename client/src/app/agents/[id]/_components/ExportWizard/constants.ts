import type { CiExportInputBody } from "@devdigest/shared";

/** The wizard's steps, in order (AC-2). The index is the `step` state. */
export const STEPS = ["target", "preview", "configure", "install"] as const;
export type StepKey = (typeof STEPS)[number];

export const STEP_TARGET = 0;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

export type Trigger = NonNullable<CiExportInputBody["triggers"]>[number];
export type PostAs = NonNullable<CiExportInputBody["post_as"]>;
export type InstallAction = NonNullable<CiExportInputBody["action"]>;

/** Canonical trigger order, same as the generated workflow (AC-7). */
export const TRIGGERS: readonly Trigger[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly Trigger[] = ["opened", "synchronize"];

export const POST_AS_OPTIONS: readonly PostAs[] = ["github_review", "pr_comment", "none"];
export const DEFAULT_POST_AS: PostAs = "github_review";
/** The option labelled "recommended" (AC-8). */
export const RECOMMENDED_POST_AS: PostAs = "github_review";

export const TARGET = "gha" as const;
export const DEFAULT_ACTION: InstallAction = "open_pr";

export const WORKFLOW_KIND = "workflow";
export const RUNNER_KIND = "runner";

/** Widest the dialog gets; `useFittedModalWidth` shrinks it on narrow windows (NFR-14). */
export const MODAL_MAX_WIDTH = 880;

export const SETTINGS_API_KEYS_HREF = "/settings/api-keys";
export const OPENROUTER_SECRET_NAME = "OPENROUTER_API_KEY";
export const RUNNER_BUILD_COMMAND = "pnpm --dir agent-runner build";
export const BLOCKING_CHECK_NAME = "DevDigest Review / review";
export const GITHUB_URL_PREFIX = "https://github.com/";
/** `owner/name` as GitHub allows it; anything else gets no outbound link. */
export const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
