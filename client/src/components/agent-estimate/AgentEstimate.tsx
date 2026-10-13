"use client";

import React from "react";
import type { AgentEstimate as AgentEstimateData } from "@devdigest/shared";
import { formatAgentEstimate } from "./helpers";
import { s } from "./styles";

/** One agent's estimate (`8.2s · $0.06`, or `—`): the median of its recent completed runs. */
export function AgentEstimate({ estimate }: { estimate: AgentEstimateData | null | undefined }) {
  return (
    <span className="mono" style={s.agent}>
      {formatAgentEstimate(estimate)}
    </span>
  );
}

export default AgentEstimate;
