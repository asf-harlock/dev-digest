ALTER TABLE "repo_convention_scans" ALTER COLUMN "provider" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "repo_convention_scans" ALTER COLUMN "model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "repo_convention_scans" ADD COLUMN "mode" text DEFAULT 'ai' NOT NULL;