ALTER TABLE "onboarding" ADD COLUMN "head_sha" text;--> statement-breakpoint
UPDATE "onboarding" SET "head_sha" = NULLIF("json"->'meta'->>'index_sha', '');
