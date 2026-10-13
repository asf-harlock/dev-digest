/* ColumnsView — the agents side by side, one column each (the "Columns" mode). */
"use client";

import React from "react";
import type { AgentColumn } from "@devdigest/shared";
import { AgentColumnCard } from "../AgentColumnCard";
import { s } from "./styles";

export function ColumnsView({
  columns,
  onOpenTrace,
}: {
  columns: AgentColumn[];
  onOpenTrace: (runId: string) => void;
}) {
  return (
    <div style={s.row}>
      {columns.map((c) => (
        <AgentColumnCard key={c.run_id} column={c} onOpenTrace={onOpenTrace} />
      ))}
    </div>
  );
}
