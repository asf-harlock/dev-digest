"use client";

import React from "react";
import type { AgentEstimate as AgentEstimateData } from "@devdigest/shared";
import { formatAgentEstimate } from "./helpers";
import { s } from "./styles";

/** One agent's estimate (`8.2s · $0.06`, or `—`): the median of its recent completed runs.
    `compact` is the smaller line that sits under an agent's name (popover rows). */
export function AgentEstimate({
  estimate,
  compact = false,
}: {
  estimate: AgentEstimateData | null | undefined;
  compact?: boolean;
}) {
  return (
    <span className="mono" style={compact ? s.agentCompact : s.agent}>
      {formatAgentEstimate(estimate)}
    </span>
  );
}

export default AgentEstimate;
