import { ConfigureRunView } from "./_components/ConfigureRunView";

/* Route: /repos/:repoId/multi-agent. Thin entry — the Configure run screen (pick a PR and the
   agents, see the estimate, start one grouped run) is colocated under _components/ConfigureRunView. */
export default function MultiAgentConfigurePage() {
  return <ConfigureRunView />;
}
