#!/usr/bin/env bash
# Deterministic half of the onion-architecture evals: overlay the skill's fixtures
# on a throwaway copy of server/src, run dependency-cruiser with the real config,
# and require exactly the violations listed in arch-expected.json.
# Hermetic: no network, no LLM, no Docker. Needs server/node_modules (pnpm install).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SKILL="$ROOT/.claude/skills/onion-architecture"
HERE="$ROOT/.claude/evals/onion-architecture"
SERVER="$ROOT/server"

[ -d "$SERVER/node_modules" ] || { echo "server/node_modules missing — run pnpm install in server/" >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rsync -a --exclude node_modules --exclude clones --exclude '*.test.ts' "$SERVER/src" "$TMP/"
cp "$SERVER/tsconfig.json" "$SERVER/.dependency-cruiser.cjs" "$SERVER/package.json" "$TMP/"
ln -s "$SERVER/node_modules" "$TMP/node_modules"

for case_dir in "$SKILL"/evals/fixtures/*/; do
  cp -R "$case_dir"server/src/. "$TMP/src/"
done

cd "$TMP"
"$SERVER/node_modules/.bin/depcruise" src --config .dependency-cruiser.cjs --output-type json > "$TMP/result.json" || true

python3 - "$TMP/result.json" "$HERE/arch-expected.json" <<'PY'
import json, sys
got_raw = json.load(open(sys.argv[1]))["summary"]["violations"]
got = {(v["rule"]["name"], v["from"]) for v in got_raw if v["rule"]["severity"] == "error"}
want = {(v["rule"], v["from"]) for v in json.load(open(sys.argv[2]))["violations"]}
missing, extra = sorted(want - got), sorted(got - want)
for r, f in missing: print(f"MISSING  {r}: {f}")
for r, f in extra:   print(f"UNEXPECTED  {r}: {f}")
if missing or extra:
    sys.exit(1)
print(f"ok — {len(want)} expected violations, nothing else")
PY
