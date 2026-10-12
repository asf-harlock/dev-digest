DROP INDEX "eval_cases_source_finding_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_source_finding_uq" ON "eval_cases" USING btree ("source_finding_id","owner_kind","owner_id");