import { describeAgent, runAgentCases } from "../../src/index.js";
// Deliberately reuses the strict variant's cases — same fixture, same practices, same
// threshold. Only the injected agent artifact differs (architecture-reviewer-lite makes the
// `rule` field optional, so citing a documented rule per finding is no longer required). That is what makes this
// pair a controlled A/B rather than two unrelated evals: pnpm eval:repeat both with labels and
// pnpm eval:delta them to see exactly which practice moved.
import { cases } from "../architecture-reviewer/architecture-reviewer.cases.js";

describeAgent("architecture-reviewer-lite", () => runAgentCases("architecture-reviewer-lite", cases));
