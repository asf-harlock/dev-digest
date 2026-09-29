#!/usr/bin/env bash
#
# check.sh — run ONE gate for ONE package and print only what an agent needs:
# a single PASS line, or the failure itself (capped) plus the path to the full
# log. Built for the `implementer` agent, whose context otherwise fills with
# raw test/lint/tsc output on every fix loop.
#
#   ./scripts/check.sh <server|client|core> <typecheck|lint|arch|test|related> [files...]
#
#   typecheck  tsc --noEmit for the package
#   lint       eslint --quiet (errors only); scoped to [files] when given
#   arch       dependency-cruiser (server/client only)
#   test       the package's unit suite (server: *.it.test.ts excluded)
#   related    only the tests that import [files] (vitest related) — the
#              inner-loop check after each plan step; [files] required
#
# [files] may be repo-relative (client/src/x.ts) or package-relative (src/x.ts).
# Docker-backed *.it.test.ts suites are never run here — call vitest directly
# when a plan step really needs them (see TESTING.md).
#
# Full output: .claude/implementer/logs/<pkg>-<gate>.log (git-ignored).
# Exit code is the gate's own (0 pass, non-zero fail); 2 = usage error.
# CHECK_MAX_LINES (default 60) caps the printed failure excerpt.
set -uo pipefail

usage() { sed -n '4,22p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ $# -ge 2 ] || usage

PKG="$1"; GATE="$2"; shift 2
MAX="${CHECK_MAX_LINES:-60}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "check.sh: not in a git repository" >&2; exit 2; }

case "$PKG" in
  server) DIR=server;        PM=pnpm ;;
  client) DIR=client;        PM=pnpm ;;
  core)   DIR=reviewer-core; PM=npm  ;;
  *) echo "check.sh: unknown package '$PKG' (server|client|core)" >&2; exit 2 ;;
esac

# Normalise [files] to package-relative paths.
FILES=()
for f in "$@"; do FILES+=("${f#"$DIR"/}"); done

run() { # the package's own binaries, whichever manager it uses
  if [ "$PM" = pnpm ]; then pnpm exec "$@"; else npx --no-install "$@"; fi
}

UNIT_EXCLUDE=()
[ "$PKG" = server ] && UNIT_EXCLUDE=(--exclude '**/*.it.test.ts')
# --silent drops console.* from tests; --bail stops a cascade after a few
# failures (the excerpt shows ~3 in full anyway).
VITEST_QUIET=(--silent --bail=5)

case "$GATE" in
  typecheck) CMD=(run tsc --noEmit -p tsconfig.json) ;;
  lint)
    [ "$PKG" = core ] && { echo "check.sh: reviewer-core has no lint gate" >&2; exit 2; }
    if [ ${#FILES[@]} -gt 0 ]; then CMD=(run eslint --quiet "${FILES[@]}"); else CMD=(run eslint --quiet .); fi ;;
  arch)
    [ "$PKG" = core ] && { echo "check.sh: reviewer-core has no arch gate" >&2; exit 2; }
    CMD=(run depcruise src --config .dependency-cruiser.cjs --output-type err) ;;
  test)    CMD=(run vitest run "${VITEST_QUIET[@]}" "${UNIT_EXCLUDE[@]+"${UNIT_EXCLUDE[@]}"}" --passWithNoTests) ;;
  related)
    [ ${#FILES[@]} -gt 0 ] || { echo "check.sh: 'related' needs at least one file" >&2; exit 2; }
    CMD=(run vitest related --run "${VITEST_QUIET[@]}" "${UNIT_EXCLUDE[@]+"${UNIT_EXCLUDE[@]}"}" --passWithNoTests "${FILES[@]}") ;;
  *) echo "check.sh: unknown gate '$GATE'" >&2; usage ;;
esac

LOGDIR="$ROOT/.claude/implementer/logs"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/$PKG-$GATE.log"
REL_LOG="${LOG#"$ROOT"/}"

t0=$(date +%s)
( cd "$ROOT/$DIR" && NO_COLOR=1 FORCE_COLOR=0 DEBUG_PRINT_LIMIT=2000 "${CMD[@]}" ) > "$LOG" 2>&1
rc=$?
secs=$(( $(date +%s) - t0 ))

# Strip any ANSI colour the tools emit despite NO_COLOR.
clean() { sed -E $'s/\x1B\\[[0-9;]*[A-Za-z]//g' "$LOG"; }

# One-line summary for vitest ("Tests  1 failed | 11 passed (12)").
vitest_summary() { clean | grep -E '^ *Tests +' | tail -1 | sed -E 's/^ *Tests +//'; }

if [ $rc -eq 0 ]; then
  extra=""
  case "$GATE" in test|related) s="$(vitest_summary)"; [ -n "$s" ] && extra="  ($s)" ;; esac
  echo "PASS $PKG:$GATE ${secs}s$extra"
  exit 0
fi

extract() {
  case "$GATE" in
    typecheck)
      n=$(clean | grep -c 'error TS')
      echo "$n TypeScript error(s):"
      clean | grep 'error TS' ;;
    test|related)
      # vitest prints failures after a "Failed Tests"/"Failed Suites"/"Unhandled
      # Errors" banner; everything before it is the per-file progress list.
      # Per failure keep: the FAIL line, the first MSG lines of the message
      # (RTL's role/DOM dumps run to hundreds of lines), then the first
      # `❯ file:line:col` location and its code frame. Drop the trailing
      # summary — the header line already carries the counts.
      if clean | grep -qE 'Failed (Tests|Suites)|Unhandled Error'; then
        clean | awk '/Failed (Tests|Suites)|Unhandled Error/{p=1} p' \
              | grep -vE '^ *$|^ *⎯+(\[[0-9]+/[0-9]+\]⎯)? *$|^ *(Test Files|Tests|Start at|Duration) |❯ .*node_modules/' \
              | awk -v MSG=12 '
                  / FAIL /                                 { print; n = 0; after = -1; next }
                  /❯ [^ ]+:[0-9]+:[0-9]+/ && after < 0     { print; after = 6; next }
                  after > 0                                { print; after--; next }
                  after == 0                               { next }
                  { if (n < MSG) print; else if (n == MSG) print "    … message truncated, see log"; n++ }'
      else
        clean | tail -n "$MAX"
      fi ;;
    *) clean | grep -vE '^ *$' ;;
  esac
}

s=""
case "$GATE" in test|related) s="$(vitest_summary)"; [ -n "$s" ] && s="  ($s)" ;; esac
echo "FAIL $PKG:$GATE ${secs}s exit=$rc$s"
out="$(extract)"
total=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
printf '%s\n' "$out" | head -n "$MAX" | sed 's/^/  /'
[ "$total" -gt "$MAX" ] && echo "  … $(( total - MAX )) more line(s) in the log"
echo "log: $REL_LOG"
exit $rc
