"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCaseDraftOwner } from "@devdigest/shared";
import { ownerEvalsTabHref, ownerKey } from "../helpers";
import { s } from "./styles";

/** Who the case goes to (AC-5): the finding's agent, then the skills that shaped its review.
 *  An owner that already has a case is disabled and links to its Evals tab as **In eval set**.
 *  Owner names are agent / skill text — a skill can be imported third-party content — rendered
 *  as escaped text, truncated with a `title` (UI-7, EC-12). */
export function OwnerPicker({
  owners,
  taken,
  value,
  onChange,
}: {
  owners: readonly EvalCaseDraftOwner[];
  /** Owners found to have a case since the draft was read (EC-5), as `ownerKey`s. */
  taken: ReadonlySet<string>;
  /** The chosen owner's `ownerKey`; null while no owner is free. */
  value: string | null;
  onChange: (key: string) => void;
}) {
  const t = useTranslations("eval");
  return (
    <fieldset style={s.group}>
      <legend style={s.legend}>{t("caseEditor.owner.legend")}</legend>
      {owners.length === 0 && <span style={s.none}>{t("caseEditor.owner.none")}</span>}
      {owners.map((o) => {
        const key = ownerKey(o);
        const hasCase = o.has_case || taken.has(key);
        return (
          <span key={key} style={s.item}>
            <label style={s.option(hasCase)} title={o.name}>
              <input
                type="radio"
                name="case-owner"
                value={key}
                checked={value === key}
                disabled={hasCase}
                onChange={() => onChange(key)}
              />
              <span style={s.name}>{o.name}</span>
              <span style={s.kind}>{o.kind === "agent" ? t("caseEditor.owner.agent") : t("caseEditor.owner.skill")}</span>
            </label>
            {hasCase && (
              <Link
                href={ownerEvalsTabHref(o)}
                style={s.inSet}
                aria-label={t("caseEditor.owner.inEvalSetLink", { name: o.name })}
              >
                <Icon.FlaskConical size={14} aria-hidden="true" />
                {t("caseEditor.owner.inEvalSet")}
              </Link>
            )}
          </span>
        );
      })}
    </fieldset>
  );
}
