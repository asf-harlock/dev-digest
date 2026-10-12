import { EvalAgentDetailView } from "./_components/EvalAgentDetailView";

/* Route: /eval/agents/:agentId (one agent's eval history). Thin route entry — all UI
   lives under _components/EvalAgentDetailView. */
export default async function EvalAgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  return <EvalAgentDetailView agentId={agentId} />;
}
