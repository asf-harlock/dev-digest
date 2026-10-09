import { describeWorkflow, runWorkflowCases } from "../src/index.js";
import { cases } from "./claude-md.cases.js";

describeWorkflow("claude-md", () => runWorkflowCases(cases));
