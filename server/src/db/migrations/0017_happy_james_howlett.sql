ALTER TABLE "pull_requests" ADD COLUMN "context_paths" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "context_fingerprint" text;