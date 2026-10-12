DROP INDEX "eval_runs_one_running_uq";--> statement-breakpoint
ALTER TABLE "eval_runs" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ALTER COLUMN "agent_version" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "eval_runs_skill_ran_idx" ON "eval_runs" USING btree ("workspace_id","skill_id","ran_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running_agent_uq" ON "eval_runs" USING btree ("agent_id") WHERE "eval_runs"."status" = 'running' AND "eval_runs"."owner_kind" = 'agent';--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_one_running_skill_uq" ON "eval_runs" USING btree ("skill_id") WHERE "eval_runs"."status" = 'running' AND "eval_runs"."owner_kind" = 'skill';