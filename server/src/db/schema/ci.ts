import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { agentRuns } from './runs';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    status: text('status', { enum: ['pending_pr', 'manual', 'active'] }).notNull(),
    prUrl: text('pr_url'),
    workflowVersion: integer('workflow_version').notNull(),
    agentVersion: integer('agent_version').notNull(),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] }).notNull(),
    triggers: jsonb('triggers').$type<string[]>().notNull(),
    ciFailOn: text('ci_fail_on', { enum: ['never', 'critical', 'warning', 'any'] }).notNull(),
    /** Manifest file slug chosen at the first export; reused on Update so a rename never adds a 2nd manifest. */
    manifestSlug: text('manifest_slug').notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
  },
  (t) => ({
    // One CI installation per repository per workspace (case-insensitive, NFR-2).
    workspaceRepoUq: uniqueIndex('ci_installations_workspace_repo_uq').on(
      t.workspaceId,
      sql`lower(${t.repo})`,
    ),
    workspaceAgentIdx: index('ci_installations_workspace_agent_idx').on(t.workspaceId, t.agentId),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    repo: text('repo').notNull(),
    agentName: text('agent_name').notNull(),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    /** GitHub Actions run id + attempt: the idempotency key of an ingest. */
    githubRunId: bigint('github_run_id', { mode: 'number' }).notNull(),
    runAttempt: integer('run_attempt').notNull(),
    headSha: text('head_sha'),
    status: text('status', { enum: ['succeeded', 'failed', 'no_findings', 'running'] }).notNull(),
    verdict: text('verdict', { enum: ['request_changes', 'approve', 'comment'] }),
    failureReason: text('failure_reason', {
      enum: ['artifact_rejected', 'no_artifact', 'artifact_expired', 'cancelled', 'timed_out', 'stale'],
    }),
    findingsCount: integer('findings_count'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    /** The GitHub job/run URL (`job_url` in the API). */
    githubUrl: text('github_url'),
    source: text('source'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    runAttemptUq: uniqueIndex('ci_runs_workspace_run_attempt_uq').on(
      t.workspaceId,
      t.githubRunId,
      t.runAttempt,
    ),
    workspaceRanAtIdx: index('ci_runs_workspace_ran_at_idx').on(t.workspaceId, t.ranAt.desc()),
    installationRanAtIdx: index('ci_runs_installation_ran_at_idx').on(
      t.ciInstallationId,
      t.ranAt.desc(),
    ),
  }),
);
