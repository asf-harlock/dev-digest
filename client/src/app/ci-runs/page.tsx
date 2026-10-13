import type { Metadata } from "next";
import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs — thin route entry. Workspace-scoped (not repo-scoped): the reviews
   that each repository's own workflow reported. Table, filters and refresh live under
   _components/CiRunsView. */
export const metadata: Metadata = { title: "CI Runs — DevDigest" };

export default function CiRunsPage() {
  return <CiRunsView />;
}
