/* BlastTree — one collapsible row per downstream-impact group: symbol header
   (caller count right-aligned) expanding to its callers (mono links to the
   exact file:line on GitHub, guide-lined like a tree) and endpoint/cron
   chips. The first row starts open, the rest collapsed — mirrors
   SmartDiffGroups' role-section chevron pattern. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CHIP_META } from "../../constants";
import { symbolLabel } from "../../helpers";
import { s } from "./styles";

export function BlastTree({
  downstream,
  unreached = [],
  kinds,
  repoFullName,
  headSha,
}: {
  downstream: DownstreamImpact[];
  /** Changed symbols with no callers — listed after the groups as muted,
   *  non-expandable rows so the tree matches the summary's symbol count. */
  unreached?: { name: string; kind: string }[];
  /** symbol name → kind (from `changed_symbols`), for the `name()` label. */
  kinds: Map<string, string>;
  /** null until the repo record loads — callers render as plain mono text,
   *  not a link, until both this and `headSha` are known. */
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  return (
    <div style={s.list}>
      {downstream.map((group, i) => (
        <TreeRow
          key={group.symbol}
          group={group}
          kind={kinds.get(group.symbol)}
          defaultOpen={i === 0}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      ))}
      {unreached.map((sym) => (
        <UnreachedRow key={sym.name} name={sym.name} kind={sym.kind} />
      ))}
    </div>
  );
}

function UnreachedRow({ name, kind }: { name: string; kind: string }) {
  const t = useTranslations("blast");
  return (
    <div style={s.quietRow}>
      <span style={s.chevronSlot} />
      <Icon.Code size={13} style={s.symbolIcon} />
      <span className="mono" style={s.quietName}>
        {symbolLabel(name, kind)}
      </span>
      <span style={s.spacer} />
      <span className="tnum" style={s.callerCount}>
        {t("callerCount", { count: 0 })}
      </span>
    </div>
  );
}

function TreeRow({
  group,
  kind,
  defaultOpen,
  repoFullName,
  headSha,
}: {
  group: DownstreamImpact;
  kind: string | undefined;
  defaultOpen: boolean;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(defaultOpen);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  const hasChips = group.endpoints_affected.length > 0 || group.crons_affected.length > 0;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={s.header}
      >
        <Chevron size={13} style={s.chevron} />
        <Icon.Code size={13} style={s.symbolIcon} />
        <span className="mono" style={s.symbolName}>
          {symbolLabel(group.symbol, kind)}
        </span>
        <span style={s.spacer} />
        <span className="tnum" style={s.callerCount}>
          {t("callerCount", { count: group.callers.length })}
        </span>
      </div>

      {open && (
        <div style={s.body}>
          <div style={s.callers}>
            {group.callers.map((caller) => (
              <div key={`${caller.file}:${caller.line}:${caller.name}`} style={s.callerRow}>
                <Icon.CornerDownRight size={12} style={s.callerIcon} />
                {repoFullName && headSha ? (
                  <MonoLink href={githubBlobUrl(repoFullName, headSha, caller.file, caller.line)}>
                    {caller.file}:{caller.line}
                  </MonoLink>
                ) : (
                  <span className="mono" style={s.callerText}>
                    {caller.file}:{caller.line}
                  </span>
                )}
              </div>
            ))}
          </div>

          {hasChips && (
            <div style={s.chips}>
              {group.endpoints_affected.map((endpoint) => (
                <Badge
                  key={endpoint}
                  mono
                  icon={CHIP_META.endpoint.icon}
                  color={CHIP_META.endpoint.color}
                  bg={CHIP_META.endpoint.bg}
                >
                  {endpoint}
                </Badge>
              ))}
              {group.crons_affected.map((cron) => (
                <Badge
                  key={cron}
                  mono
                  icon={CHIP_META.cron.icon}
                  color={CHIP_META.cron.color}
                  bg={CHIP_META.cron.bg}
                >
                  {cron}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
