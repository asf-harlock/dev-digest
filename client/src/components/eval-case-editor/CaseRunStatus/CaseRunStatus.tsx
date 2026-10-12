"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { CaseRunFlow } from "../use-case-run";
import { s } from "./styles";

/** What an Evals tab says about the case run it follows (SPEC-10 AC-41, AC-42, EC-23, EC-24):
 *  one `aria-live="polite"` region announcing the final status, the timeout sentence, and — when
 *  a poll request failed — a **Retry** that resumes polling. The failure itself is toasted once by
 *  the global handler; this adds no second toast. The region is rendered while idle so a screen
 *  reader hears the first change. */
export function CaseRunStatus({
  flow,
  live = true,
}: {
  flow: Pick<CaseRunFlow, "finished" | "timedOut" | "pollFailed" | "retry">;
  /** False: no live region of its own — the caller already sits inside one (the Case Editor's
   *  banner slot), so there is still exactly one `aria-live="polite"` region. */
  live?: boolean;
}) {
  const t = useTranslations("eval");
  const { finished, timedOut, pollFailed, retry } = flow;
  return (
    <div style={s.wrap}>
      {live && (
        <div aria-live="polite" aria-atomic="true" style={s.live}>
          {finished ? t(`caseRun.live.${finished}`) : null}
        </div>
      )}
      {timedOut && <span style={s.warn}>{t("runStatus.timeout")}</span>}
      {pollFailed && (
        <>
          <span style={s.warn}>{t("runStatus.pollFailed")}</span>
          <Button type="button" kind="ghost" size="sm" onClick={retry}>
            {t("runStatus.retry")}
          </Button>
        </>
      )}
    </div>
  );
}
