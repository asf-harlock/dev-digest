"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { TourRunLocally } from "@devdigest/shared";
import { s } from "./styles";

/** Numbered monospace command rows, each with a labelled copy button (AC-7, AC-30, EC-18). */
export function RunLocallySection({ section }: { section: TourRunLocally | undefined }) {
  const t = useTranslations("onboarding");
  const [announce, setAnnounce] = React.useState("");
  const commands = section?.commands ?? [];
  const envKeys = section?.env_keys ?? [];

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setAnnounce(t("tour.copied"));
    } catch {
      setAnnounce(t("tour.copyFailed"));
    }
  };

  if (commands.length === 0) return <p style={s.empty}>{t("tour.empty.runLocally")}</p>;
  return (
    <div>
      <ol style={s.list}>
        {commands.map((c, i) => (
          <li key={`${i}-${c.command}`} style={s.row}>
            <span style={s.index} aria-hidden="true">{i + 1}</span>
            <code className="mono" style={s.command}>
              {c.command}
              {c.description ? <span style={s.desc}> # {c.description}</span> : null}
            </code>
            <button
              type="button"
              style={s.copy}
              aria-label={t("tour.copyLabel", { command: c.command })}
              onClick={() => void copy(c.command)}
            >
              <Icon.Copy size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      {envKeys.length > 0 && <p style={s.env}>{t("tour.envKeys", { keys: envKeys.join(", ") })}</p>}
      <div role="status" aria-live="polite" style={s.live}>{announce}</div>
    </div>
  );
}

export default RunLocallySection;
