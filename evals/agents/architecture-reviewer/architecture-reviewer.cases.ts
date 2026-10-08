import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The fixture paths are synthetic (there is no server/src/modules/checkout/ on disk), so tell the
// agent up front that the diff is the whole change. Without this a reviewer that follows "read the
// file, don't infer from the hunk" burns turns on ENOENT and downgrades findings to cannot-verify —
// noise that would land on both variants equally and drown the one difference under test.
const reviewPrompt = (fixture: string) => `Audit this diff against DevDigest's documented structural contracts.
The diff below is the complete change; the files are not checked out, so take file and line
numbers from the hunks.

${fx(fixture)}`;

const REVIEW_PROMPT = reviewPrompt("checkout-service.diff");

// A second real diff whose violations map onto documented reviewer-core rules (the ZERO I/O
// invariant, the grounding gate). A pure-I/O import is the kind of finding a model will describe
// in prose without necessarily naming the documented rule behind it.
const REVIEWER_CORE_PROMPT = reviewPrompt("reviewer-core-gate.diff");

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from naming a documented rule per
// finding, the lite variant is more prone to fabricating a judgment/best-practice finding where
// the strict variant stays silent.
const BENIGN_PROMPT = reviewPrompt("benign-refactor.diff");

// Shared across architecture-reviewer and architecture-reviewer-lite so the two agents are graded
// on the exact same task: same prompts, fixtures, practices, thresholds and turn budgets. The only
// thing that should move between the two runs is the agent definition — specifically whether
// "names the specific documented rule" keeps passing now that `rule` is optional in lite.
//
// Rule names below are the ones the repo actually documents: dependency-cruiser rule names in
// server/.dependency-cruiser.cjs, the numbered rules in .claude/skills/onion-architecture/SKILL.md,
// server/CLAUDE.md, reviewer-core/CLAUDE.md and the rule ids in pr-self-review's severity-rubric.md.
// Do not invent identifiers here — a judge cannot verify one the docs never contain.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      // 1. Detection of both violations
      "flags the domain file (checkout.ts) importing the `FastifyReply` type from 'fastify' as a violation: an HTTP-framework type has leaked into the domain layer",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation: a concrete repository is constructed directly instead of being taken from the DI container",
      // 2. Severity
      // http-framework-only-in-routes is a dependency-cruiser `error` rule → CRITICAL; the DI rule has
      // no machine gate (no-concrete-adapter-in-modules only matches src/adapters/) → WARNING.
      "rates the FastifyReply-import finding CRITICAL and the `new PgCheckoutRepository()` finding WARNING",
      // 3. Specific documented rule per finding
      "for the FastifyReply import, names a specific documented rule — the dependency-cruiser rule `http-framework-only-in-routes`, the onion-architecture rule 'Fastify types stay in routes.ts', or the matching server/CLAUDE.md / onion-architecture dependency-direction rule — not just a prose description",
      "for the `new PgCheckoutRepository()` call, names a specific documented rule — the onion-architecture / server/CLAUDE.md rule 'take dependencies from the container, never construct or import a concrete class' (`ContainerOverrides`) — not just a prose description, and does not claim a dependency-cruiser rule (e.g. `no-concrete-adapter-in-modules`) or `pnpm arch` catches it",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      // Mentioning `reply?` as part of the Fastify finding is correct — it IS that violation.
      "raises no security, performance or runtime-bug finding about the optional `reply?: FastifyReply` parameter (treating it as part of the Fastify-import violation is fine)",
      "raises no standalone finding about naming, style or test coverage (citing testability as the reason an architecture rule exists is fine)",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the documented reviewer-core rule for each reviewer-core violation",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the `groundFindings()` citation gate before emitting findings",
      "ties the fs-import finding to a documented rule — the reviewer-core/CLAUDE.md 'ZERO I/O' invariant (or the `reviewer-core-io` rule id) — rather than only describing it in prose",
      "ties the skipped-gate finding to a documented rule — reviewer-core/CLAUDE.md ('the score is recomputed from findings that survived grounding') or reviewer-core/docs/grounding.md (the grounding gate) — rather than only describing it in prose",
      "states that no machine gate (`pnpm arch`) exists for reviewer-core rather than implying one does",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or records only SUGGESTION-level, non-blocking observations) — it does not invent a CRITICAL or WARNING finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
