"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { TourReadingPath } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { isActiveRecently } from "./helpers";
import { s } from "./styles";

/**
 * Numbered list of files to read, each with a one-line reason (AC-8). Each
 * path opens the file on GitHub in a new tab, pinned like the critical-path
 * "Open" links (AC-31); without a repo name or ref it stays plain text.
 */
export function ReadingPathSection({
  section,
  activityRanked = false,
  repoFullName,
  sha,
}: {
  section: TourReadingPath | undefined;
  activityRanked?: boolean;
  repoFullName?: string;
  /** `index_sha`, or the default branch when the SHA is empty. */
  sha?: string;
}) {
  const t = useTranslations("onboarding");
  const items = section?.items ?? [];
  if (items.length === 0) return <p style={s.empty}>{t("tour.empty.readingPath")}</p>;
  return (
    <ol style={s.list}>
      {items.map((item, i) => (
        <li key={item.path} style={s.item}>
          <span style={s.num} aria-hidden="true">{i + 1}</span>
          <div>
            <div className="mono" style={s.path}>
              {repoFullName && sha ? (
                <a
                  href={githubBlobUrl(repoFullName, sha, item.path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("tour.openLabel", { path: item.path })}
                  style={s.link}
                >
                  {item.path}
                </a>
              ) : (
                item.path
              )}
              {activityRanked && isActiveRecently(item.hotness) && (
                <span style={s.active}> · {t("tour.activeRecently")}</span>
              )}
            </div>
            <p style={s.why}>{item.why}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default ReadingPathSection;
