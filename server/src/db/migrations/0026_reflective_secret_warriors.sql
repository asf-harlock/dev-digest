-- SPEC-11 Export to CI. Hand-edited AFTER `pnpm db:generate` (the generated version added
-- NOT NULL columns without defaults, which fails on a non-empty table):
-- add columns nullable -> backfill from `agents` / the installation -> SET NOT NULL.
-- Legacy `ci_runs` without an installation cannot be attributed to a workspace and are deleted.
-- A case-insensitive duplicate (workspace, repo) aborts the migration with a message
-- instead of silently deleting installations.

-- 1. ci_installations: new columns, nullable for now.
ALTER TABLE "ci_installations" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "workflow_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" jsonb;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "ci_fail_on" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "manifest_slug" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_refreshed_at" timestamp with time zone;--> statement-breakpoint

-- 2. Backfill pre-existing installations. `workflow_version` 0 = not produced by this generator,
--    so the UI reports "Update available" for them.
UPDATE "ci_installations" AS i SET
	"workspace_id" = a."workspace_id",
	"status" = 'active',
	"workflow_version" = 0,
	"agent_version" = a."version",
	"post_as" = 'github_review',
	"triggers" = '["opened","synchronize","reopened"]'::jsonb,
	"ci_fail_on" = a."ci_fail_on",
	"manifest_slug" = left(coalesce(nullif(trim(both '-' from regexp_replace(lower(a."name"), '[^a-z0-9]+', '-', 'g')), ''), 'agent'), 64)
FROM "agents" AS a
WHERE a."id" = i."agent_id";--> statement-breakpoint

ALTER TABLE "ci_installations" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ALTER COLUMN "workflow_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ALTER COLUMN "agent_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ALTER COLUMN "post_as" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ALTER COLUMN "triggers" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ALTER COLUMN "ci_fail_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ALTER COLUMN "manifest_slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 3. ci_runs: new columns, nullable for now.
ALTER TABLE "ci_runs" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "github_run_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "run_attempt" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "ingested_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- 4. Legacy runs with no installation have no workspace: delete them. The rest are backfilled
--    from their installation; `github_run_id` gets a unique synthetic NEGATIVE id (a real GitHub
--    run id is always positive) and `run_attempt` 1.
DELETE FROM "ci_runs" WHERE "ci_installation_id" IS NULL;--> statement-breakpoint

UPDATE "ci_runs" AS r SET
	"workspace_id" = i."workspace_id",
	"repo" = i."repo",
	"agent_name" = a."name"
FROM "ci_installations" AS i
JOIN "agents" AS a ON a."id" = i."agent_id"
WHERE i."id" = r."ci_installation_id";--> statement-breakpoint

UPDATE "ci_runs" AS r SET
	"github_run_id" = -n."rn",
	"run_attempt" = 1,
	"status" = CASE
		WHEN r."status" IN ('succeeded', 'failed', 'no_findings', 'running') THEN r."status"
		WHEN lower(coalesce(r."status", '')) IN ('failed', 'failure', 'error') THEN 'failed'
		WHEN coalesce(r."findings_count", 0) = 0 THEN 'no_findings'
		ELSE 'succeeded'
	END
FROM (SELECT "id", row_number() OVER (ORDER BY "id") AS "rn" FROM "ci_runs") AS n
WHERE n."id" = r."id";--> statement-breakpoint

ALTER TABLE "ci_runs" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ALTER COLUMN "repo" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ALTER COLUMN "agent_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ALTER COLUMN "github_run_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ALTER COLUMN "run_attempt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 5. Duplicate check BEFORE the unique index: one installation per repository per workspace.
DO $$
DECLARE dup text;
BEGIN
	SELECT string_agg(lower("repo") || ' (' || "n" || ' installations)', ', ') INTO dup
	FROM (
		SELECT "workspace_id", lower("repo") AS "repo", count(*) AS "n"
		FROM "ci_installations"
		GROUP BY "workspace_id", lower("repo")
		HAVING count(*) > 1
	) AS d;
	IF dup IS NOT NULL THEN
		RAISE EXCEPTION 'Cannot add the unique index ci_installations_workspace_repo_uq: duplicate repositories in ci_installations: %. Delete or merge the duplicate rows, then re-run the migration.', dup;
	END IF;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX "ci_installations_workspace_repo_uq" ON "ci_installations" USING btree ("workspace_id",lower("repo"));--> statement-breakpoint
CREATE INDEX "ci_installations_workspace_agent_idx" ON "ci_installations" USING btree ("workspace_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_workspace_run_attempt_uq" ON "ci_runs" USING btree ("workspace_id","github_run_id","run_attempt");--> statement-breakpoint
CREATE INDEX "ci_runs_workspace_ran_at_idx" ON "ci_runs" USING btree ("workspace_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ci_runs_installation_ran_at_idx" ON "ci_runs" USING btree ("ci_installation_id","ran_at" DESC NULLS LAST);
