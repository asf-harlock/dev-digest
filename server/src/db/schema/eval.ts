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
  EvalLift,
  EvalSkillRunSnapshot,
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
    // One case per finding PER OWNER (an agent and a skill may each hold a case from the
    // same finding); NULLs (cases not made from a finding) stay allowed.
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq').on(
      t.sourceFindingId,
      t.ownerKind,
      t.ownerId,
    ),
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
    // Null for a skill run (SPEC-09): its carrier lives in `carrier_agent_id`.
    agentId: uuid('agent_id'),
    status: text('status', { enum: ['running', 'completed', 'partial', 'errored'] })
      .notNull()
      .default('running'),
    agentVersion: integer('agent_version'),
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
    // ---- SPEC-09 skill runs (Phase B). A skill run reuses the columns above for its with-skill
    // arm (snapshot = carrier snapshot, case_results = with-arm outcomes, metric_parts + recall /
    // precision / citation columns = with-arm values, cost_usd = total over both arms).
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] })
      .notNull()
      .default('agent'),
    // No FK on purpose (like `agent_id`): the skill-delete cascade is programmatic (EC-23).
    skillId: uuid('skill_id'),
    skillVersion: integer('skill_version'),
    carrierAgentId: uuid('carrier_agent_id'),
    // Scalar copies of the carrier snapshot so the trend never reads a jsonb (NFR-13).
    carrierName: text('carrier_name'),
    carrierVersion: integer('carrier_version'),
    carrierModel: text('carrier_model'),
    skillSnapshot: jsonb('skill_snapshot').$type<EvalSkillRunSnapshot>(),
    withoutMetrics: jsonb('without_metrics').$type<EvalMetrics>(),
    withoutResults: jsonb('without_results').$type<EvalCaseOutcome[]>().default([]),
    lift: jsonb('lift').$type<EvalLift>(),
    // ---- SPEC-10: what the run covered. `set` = the whole case set (every pre-existing row),
    // `case` = a single-case run. The two single-flight indexes above cover every scope.
    scope: text('scope', { enum: ['set', 'case'] })
      .notNull()
      .default('set'),
  },
  (t) => ({
    agentRanIdx: index('eval_runs_agent_ran_idx').on(t.workspaceId, t.agentId, t.ranAt.desc()),
    skillRanIdx: index('eval_runs_skill_ran_idx').on(t.workspaceId, t.skillId, t.ranAt.desc()),
    // Single-flight: at most one running run per agent and one per skill (SPEC-09 NFR-5, EC-15).
    // A skill run and its carrier's own agent run do not block each other.
    oneRunningAgentUq: uniqueIndex('eval_runs_one_running_agent_uq')
      .on(t.agentId)
      .where(sql`${t.status} = 'running' AND ${t.ownerKind} = 'agent'`),
    oneRunningSkillUq: uniqueIndex('eval_runs_one_running_skill_uq')
      .on(t.skillId)
      .where(sql`${t.status} = 'running' AND ${t.ownerKind} = 'skill'`),
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
