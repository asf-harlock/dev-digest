/* PrContextPreviewDrawer — read-only preview of one document. Rendered with
   SafeMarkdown: raw HTML is skipped and javascript:/data: URLs are blanked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, Skeleton } from "@devdigest/ui";
import { SafeMarkdown } from "@/components/safe-markdown";
import { usePrContextPreview } from "@/lib/hooks/pr-context";
import { s } from "./styles";

export function PrContextPreviewDrawer({
  prId,
  path,
  attached,
  toggleDisabled,
  onToggle,
  onClose,
}: {
  prId: string | null;
  path: string;
  attached: boolean;
  toggleDisabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("prContext");
  const { data, isLoading, isError } = usePrContextPreview(prId, path);
  return (
    <Drawer
      width={640}
      title={<span className="mono">{path}</span>}
      subtitle={data?.read_from ? t(`preview.readFrom.${data.read_from}`) : undefined}
      onClose={onClose}
    >
      {data && (
        <div style={s.meta}>
          <span>{t(`kind.${data.kind}`)}</span>
          <span>{t(`origin.${data.origin}`)}</span>
          <span>{t("row.tokens", { tokens: data.tokens })}</span>
          {data.read_at_sha && (
            <span className="mono">{t("preview.readAt", { sha: data.read_at_sha.slice(0, 7) })}</span>
          )}
        </div>
      )}
      <div style={s.toggle}>
        <Button
          kind={attached ? "primary" : "secondary"}
          size="sm"
          aria-pressed={attached}
          disabled={toggleDisabled}
          onClick={onToggle}
        >
          {attached ? t("preview.attached") : t("preview.attach")}
        </Button>
      </div>
      {isLoading ? (
        <Skeleton height={120} />
      ) : isError ? (
        <div style={s.note} role="alert">{t("preview.error")}</div>
      ) : data && data.status === "attached" && data.text != null ? (
        <div style={s.body}>
          <SafeMarkdown>{data.text}</SafeMarkdown>
        </div>
      ) : (
        <div style={s.note}>{t(`preview.status.${data?.status ?? "unreadable"}`)}</div>
      )}
    </Drawer>
  );
}
