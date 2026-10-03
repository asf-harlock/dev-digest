import { z } from 'zod';

/**
 * What the model may return (slice 3). Deliberately narrower than the stored
 * `Onboarding` contract: there is no command field beyond a description for a
 * command that already exists in the facts, and every path is re-checked by
 * the grounding merge. Free text is capped so a runaway answer cannot bloat the row.
 */
const Text = z.string().max(4000);
const Short = z.string().max(400);

export const RawTour = z.object({
  architecture: z.object({
    body: Text,
    nodes: z.array(z.object({ id: Short, label: Short, path: Short })).max(40),
    edges: z.array(z.object({ from: Short, to: Short })).max(80),
  }),
  critical_paths: z.array(z.object({ path: Short, reason: Short })).max(40),
  run_locally: z.array(z.object({ command: Short, description: Short })).max(60),
  reading_path: z.array(z.object({ path: Short, why: Short })).max(40),
  first_tasks: z
    .array(
      z.object({
        title: Short,
        description: Text,
        paths: z.array(Short).max(10),
        complexity: z.enum(['low', 'medium', 'high']),
      }),
    )
    .max(12),
});
export type RawTour = z.infer<typeof RawTour>;
