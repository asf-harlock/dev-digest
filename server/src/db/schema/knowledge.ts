import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/** One `POST /repos/:id/conventions/extract` run — the "N sample files · Xh ago" metadata. */
export const repoConventionScans = pgTable(
  'repo_convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    sampleFileCount: integer('sample_file_count').notNull(),
    configFileCount: integer('config_file_count').notNull(),
    candidateCount: integer('candidate_count').notNull(),
    mode: text('mode', { enum: ['local', 'ai', 'both'] }).notNull().default('ai'),
    // null when `mode = 'local'` — no model call was made.
    provider: text('provider'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => ({ repoIdx: index('repo_convention_scans_repo_idx').on(t.repoId) }),
);

/**
 * A single extracted convention candidate, grounded to a `file:start-end` citation.
 * Re-scanning a repo replaces every row for that repo (see conventions/repository.ts
 * `replaceAll`) — there is no cross-scan history/dedup.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => repoConventionScans.id, { onDelete: 'cascade' }),
    category: text('category', {
      enum: ['naming', 'structure', 'error_handling', 'testing', 'imports', 'style', 'other'],
    }).notNull(),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path').notNull(),
    evidenceStartLine: integer('evidence_start_line').notNull(),
    evidenceEndLine: integer('evidence_end_line').notNull(),
    evidenceSnippet: text('evidence_snippet').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull().default('pending'),
    createdAt: now(),
  },
  (t) => ({
    wsIdx: index('conventions_ws_idx').on(t.workspaceId),
    repoIdx: index('conventions_repo_idx').on(t.repoId),
    scanIdx: index('conventions_scan_idx').on(t.scanId),
  }),
);
