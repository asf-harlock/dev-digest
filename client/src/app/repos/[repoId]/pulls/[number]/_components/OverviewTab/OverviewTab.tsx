"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  intent: PrIntentRecord | null | undefined;
  headSha: string | null | undefined;
}

// D8 (specs/03-intent-layer.md): the Intent card renders first — "before the
// review results" reads most literally as "the first thing on the PR page",
// and Overview is the default tab.
export function OverviewTab({ prId, prBody, intent, headSha }: OverviewTabProps) {
  return (
    <>
      <IntentCard prId={prId} intent={intent} headSha={headSha} />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
