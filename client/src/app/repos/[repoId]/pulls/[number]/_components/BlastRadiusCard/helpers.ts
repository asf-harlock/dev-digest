/* BlastRadiusCard/helpers.ts — pure transforms: summary stats (deduped across
   downstream groups) and the Tree→Graph mermaid conversion. Framework-free so
   both are testable without rendering anything (helpers.test.ts, WP-T). */
import type { BlastRadius } from "@devdigest/shared";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Counts for the summary row. `symbols` is every changed symbol (including
 *  ones with zero callers, already excluded from `downstream` server-side —
 *  server/CLAUDE.md WP-A helpers.ts). `endpoints`/`crons` are deduped ACROSS
 *  groups: the same endpoint can be reached from more than one changed symbol
 *  and should still read as "3 endpoints", not once per symbol that reaches
 *  it. `callers` is a flat sum — a caller can legitimately appear once per
 *  symbol it calls into. */
export function statsFor(blast: BlastRadius): BlastStats {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const group of blast.downstream) {
    callers += group.callers.length;
    for (const endpoint of group.endpoints_affected) endpoints.add(endpoint);
    for (const cron of group.crons_affected) crons.add(cron);
  }
  return {
    symbols: blast.changed_symbols.length,
    callers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

/** Kinds rendered with call parens in the tree (`rateLimit()`); a changed
 *  class, type or enum keeps its bare name. */
const CALLABLE_KINDS = new Set(["function", "method"]);

/** Display label for a changed symbol, given the kind from `changed_symbols`
 *  (`downstream` carries only the bare name). */
export function symbolLabel(name: string, kind: string | undefined): string {
  return kind && CALLABLE_KINDS.has(kind) ? `${name}()` : name;
}

/** Name → kind lookup over `changed_symbols`; first declaration wins, the
 *  same way the server collapses same-named symbols into one group. */
export function kindsByName(blast: BlastRadius): Map<string, string> {
  const kinds = new Map<string, string>();
  for (const sym of blast.changed_symbols) if (!kinds.has(sym.name)) kinds.set(sym.name, sym.kind);
  return kinds;
}

/** Changed symbols no caller reaches (the server leaves them out of
 *  `downstream`), deduped by name in `changed_symbols` order — so the tree
 *  and graph can still show every symbol the summary row counts. */
export function symbolsWithoutCallers(blast: BlastRadius): { name: string; kind: string }[] {
  const reached = new Set(blast.downstream.map((d) => d.symbol));
  const out: { name: string; kind: string }[] = [];
  const seen = new Set<string>();
  for (const sym of blast.changed_symbols) {
    if (reached.has(sym.name) || seen.has(sym.name)) continue;
    seen.add(sym.name);
    out.push({ name: sym.name, kind: sym.kind });
  }
  return out;
}

/** Characters that mermaid's flowchart node-label syntax would otherwise
 *  parse as structure (quotes end the label early, `#`/`;` are entity/
 *  statement syntax, brackets/parens/angle-brackets can be read as another
 *  node shape or an HTML tag) — mapped to their HTML entity so mermaid
 *  renders the literal character instead. A SINGLE regex pass replaces each
 *  match against the ORIGINAL string, so an entity this function just
 *  inserted (which itself contains `&` and `;`) is never re-escaped. */
const MERMAID_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
  "(": "&#40;",
  ")": "&#41;",
  "[": "&#91;",
  "]": "&#93;",
  "{": "&#123;",
  "}": "&#125;",
  "#": "&#35;",
  ";": "&#59;",
};

function escapeMermaidLabel(label: string): string {
  return label.replace(/[&"<>()[\]{}#;]/g, (ch) => MERMAID_ESCAPES[ch] ?? ch);
}

/** Builds a `flowchart LR` graph of changed symbol → caller → endpoint (the
 *  mockup's 3-column flow; crons are summarised in the stat row and tree
 *  chips only, not graphed). Node ids are assigned once per DISTINCT value
 *  (symbol name / `file:line:name` / endpoint string) and reused on repeat —
 *  s0/c0/e0-style, one prefix per tier — so the same caller or endpoint
 *  reached from two symbols renders as one node, never a duplicate box. */
export function toMermaid(blast: BlastRadius): string {
  const lines = ["flowchart LR"];
  const ids = new Map<string, string>();
  let sSeq = 0;
  let cSeq = 0;
  let eSeq = 0;

  function idFor(prefix: "s" | "c" | "e", key: string, label: string): string {
    const cacheKey = `${prefix}:${key}`;
    const existing = ids.get(cacheKey);
    if (existing) return existing;
    const seq = prefix === "s" ? sSeq++ : prefix === "c" ? cSeq++ : eSeq++;
    const id = `${prefix}${seq}`;
    ids.set(cacheKey, id);
    lines.push(`  ${id}["${escapeMermaidLabel(label)}"]`);
    return id;
  }

  for (const group of blast.downstream) {
    const symbolId = idFor("s", group.symbol, group.symbol);
    for (const caller of group.callers) {
      const callerKey = `${caller.file}:${caller.line}:${caller.name}`;
      const callerId = idFor("c", callerKey, `${caller.file}:${caller.line}`);
      lines.push(`  ${symbolId} --> ${callerId}`);
      for (const endpoint of group.endpoints_affected) {
        const endpointId = idFor("e", endpoint, endpoint);
        lines.push(`  ${callerId} --> ${endpointId}`);
      }
    }
  }

  // Symbols nobody calls: isolated nodes, so the graph accounts for every
  // symbol the summary row counts.
  for (const sym of symbolsWithoutCallers(blast)) idFor("s", sym.name, sym.name);

  return lines.join("\n");
}
