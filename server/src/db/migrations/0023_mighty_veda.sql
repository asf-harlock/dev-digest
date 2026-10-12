ALTER TABLE "eval_runs" ADD COLUMN "owner_kind" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "skill_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "skill_version" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "carrier_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "carrier_name" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "carrier_version" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "carrier_model" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "skill_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "without_metrics" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "without_results" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "lift" jsonb;