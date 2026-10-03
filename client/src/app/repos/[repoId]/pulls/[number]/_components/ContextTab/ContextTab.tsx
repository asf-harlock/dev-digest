/* ContextTab — the PR's "Context" tab (specs/07-pr-context.md): the ordered
   list of attached documents, suggestions and the attachable documents, with a
   token total. Every toggle/move saves the full list at once (no Save button);
   controls are disabled while a save is in flight (EC-14) and the last saved
   list is restored on failure (EC-15). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton, ErrorState } from "@devdigest/ui";
import { usePrContext, useSavePrContext } from "@/lib/hooks/pr-context";
import { PrContextRow } from "../PrContextRow";
import { PrContextFooter } from "../PrContextFooter";
import { PrContextSuggestions } from "../PrContextSuggestions";
import { PrContextPreviewDrawer } from "../PrContextPreviewDrawer";
import { MAX_ATTACHED } from "./constants";
import { filterPaths, moveItem } from "./helpers";
import { s } from "./styles";

export function ContextTab({ prId }: { prId: string | null }) {
  const t = useTranslations("prContext");
  const { data, isLoading, isError, refetch } = usePrContext(prId);
  const save = useSavePrContext(prId);
  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div style={s.skeletonStack} data-testid="context-skeleton">
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={36} />
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState title={t("loadError")} onRetry={() => refetch()} />;
  }

  const attachedPaths = data.entries.map((e) => e.path);
  const attachedSet = new Set(attachedPaths);
  const busy = save.isPending;
  const atLimit = attachedPaths.length >= MAX_ATTACHED;
  const persist = (paths: string[]) => save.mutate({ paths });
  const candidates = data.attachable.filter((a) => !attachedSet.has(a.path));
  const shown = filterPaths(candidates, filter);

  return (
    <div style={s.stack}>
      {!data.cloned && (
        <div style={s.notice} role="status">
          <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>{t("notCloned")}</span>
        </div>
      )}

      <section style={s.section} aria-label={t("attached.title")}>
        <h2 style={s.heading}>{t("attached.title")}</h2>
        {data.entries.length === 0 ? (
          <p style={s.muted}>{t("attached.empty")}</p>
        ) : (
          <ul style={s.list}>
            {data.entries.map((e, i) => (
              <PrContextRow
                key={e.path}
                path={e.path}
                origin={e.origin}
                entry={e}
                checked
                disabled={busy}
                index={i}
                count={data.entries.length}
                onToggle={() => persist(attachedPaths.filter((p) => p !== e.path))}
                onMove={(d) => persist(moveItem(attachedPaths, i, d))}
                onPreview={() => setPreviewPath(e.path)}
              />
            ))}
          </ul>
        )}
        <PrContextFooter
          used={data.budget.used}
          limit={data.budget.limit}
          saveFailed={save.isError}
          saving={busy}
          mapReduce={data.map_reduce}
        />
      </section>

      <PrContextSuggestions
        suggestions={data.suggestions.filter((sg) => !attachedSet.has(sg.path))}
        disabled={busy || atLimit}
        onAdd={(path) => persist([...attachedPaths, path])}
      />

      <section style={s.section} aria-label={t("attachable.title")}>
        <h2 style={s.heading}>{t("attachable.title")}</h2>
        {atLimit && <p style={s.muted}>{t("attachable.limit", { max: MAX_ATTACHED })}</p>}
        {candidates.length === 0 ? (
          <p style={s.muted}>{t("attachable.empty")}</p>
        ) : (
          <>
            <input
              type="search"
              style={s.filter}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("attachable.filter")}
              aria-label={t("attachable.filter")}
            />
            {shown.length === 0 ? (
              <p style={s.muted}>
                {t("attachable.noMatch")}{" "}
                <Button kind="secondary" size="sm" onClick={() => setFilter("")}>
                  {t("attachable.clearFilter")}
                </Button>
              </p>
            ) : (
              <ul style={s.list}>
                {shown.map((a) => (
                  <PrContextRow
                    key={a.path}
                    path={a.path}
                    origin={a.origin}
                    checked={false}
                    disabled={busy || atLimit}
                    onToggle={() => persist([...attachedPaths, a.path])}
                    onPreview={() => setPreviewPath(a.path)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {previewPath && (
        <PrContextPreviewDrawer
          prId={prId}
          path={previewPath}
          attached={attachedSet.has(previewPath)}
          toggleDisabled={busy || (!attachedSet.has(previewPath) && atLimit)}
          onToggle={() =>
            persist(
              attachedSet.has(previewPath)
                ? attachedPaths.filter((p) => p !== previewPath)
                : [...attachedPaths, previewPath],
            )
          }
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}
