"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { TourCriticalPaths } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

/** One row per critical file with its reason and an Open link (AC-6, AC-31). */
export function CriticalPathsSection({
  section,
  repoFullName,
  sha,
}: {
  section: TourCriticalPaths | undefined;
  repoFullName: string | undefined;
  /** `index_sha`, or the default branch when the SHA is empty. */
  sha: string | undefined;
}) {
  const t = useTranslations("onboarding");
  const items = section?.items ?? [];
  if (items.length === 0) return <p style={s.empty}>{t("tour.empty.criticalPaths")}</p>;
  return (
    <ul style={s.list}>
      {items.map((item) => (
        <li key={item.path} style={s.row}>
          <Icon.FileText size={14} aria-hidden="true" />
          <span className="mono" style={s.path}>{item.path}</span>
          <span style={s.reason}>— {item.reason}</span>
          {repoFullName && sha && (
            <a
              href={githubBlobUrl(repoFullName, sha, item.path)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("tour.openLabel", { path: item.path })}
              style={s.open}
            >
              {t("tour.open")}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export default CriticalPathsSection;
