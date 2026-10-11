import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  EvalCaseMeta,
  EvalExpectation,
  EvalRunSnapshot,
  EvalCaseRef,
  EvalCaseOutcome,
  EvalMetrics,
} from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff').notNull(),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta').$type<EvalCaseMeta>().notNull(),
    expectedOutput: jsonb('expected_output').$type<EvalExpectation>().notNull(),
    notes: text('notes'),
    // No FK on purpose: a case outlives its finding / review / PR (EC-8).
    sourceFindingId: uuid('source_finding_id'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index('eval_cases_owner_idx').on(t.workspaceId, t.ownerKind, t.ownerId),
    // One case per finding; NULLs (cases not made from a finding) stay allowed.
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq').on(t.sourceFindingId),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // No FK: the agent-delete cascade is programmatic (AgentsService.delete → evalRepo.deleteByAgent).
    agentId: uuid('agent_id').notNull(),
    status: text('status', { enum: ['running', 'completed', 'partial', 'errored'] })
      .notNull()
      .default('running'),
    agentVersion: integer('agent_version').notNull(),
    snapshot: jsonb('snapshot').$type<EvalRunSnapshot>().notNull(),
    caseSet: jsonb('case_set').$type<EvalCaseRef[]>().notNull(),
    caseResults: jsonb('case_results').$type<EvalCaseOutcome[]>().notNull().default([]),
    metricParts: jsonb('metric_parts').$type<EvalMetrics>(),
    tracesPassed: integer('traces_passed'),
    tracesTotal: integer('traces_total'),
    casesErrored: integer('cases_errored').notNull().default(0),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorReason: text('error_reason'),
    // `ranAt` is the run's start time.
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    agentRanIdx: index('eval_runs_agent_ran_idx').on(t.workspaceId, t.agentId, t.ranAt.desc()),
    // Single-flight: at most one running run per agent (EC-10, EC-37).
    oneRunningUq: uniqueIndex('eval_runs_one_running_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
