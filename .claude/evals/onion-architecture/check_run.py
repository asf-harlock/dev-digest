#!/usr/bin/env python3
"""Deterministic checks for the code-writing evals (cases 4-6 in the skill's evals.json).

Takes the patch an eval run produced, applies it to a pristine export of HEAD and
reports machine-verifiable facts (arch gate, new type errors, new hermetic tests,
where code landed). Judgement-only assertions are left to a grader.

  check_run.py --repo <repo> --case polling|stale|webhook --patch <file> --work <dir> --out <checks.json>
  check_run.py --repo <repo> --baseline --work <dir>          # prints the type-error baseline
"""
import argparse, json, os, re, shutil, subprocess, sys


def sh(cmd, cwd, timeout=600):
    p = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout + p.stderr)


def export_head(repo, dest):
    if os.path.exists(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)
    rc, out = sh(f"git archive HEAD server reviewer-core | tar -x -C '{dest}'", repo)
    assert rc == 0, out
    for pkg in ("server", "reviewer-core"):
        os.symlink(os.path.join(repo, pkg, "node_modules"), os.path.join(dest, pkg, "node_modules"))


def tsc_errors(root):
    rc, out = sh("node_modules/.bin/tsc --noEmit -p tsconfig.json", os.path.join(root, "server"))
    errs = set()
    for line in out.splitlines():
        m = re.match(r"^(.*?)\(\d+,\d+\): (error TS\d+: .*)$", line)
        if m:
            errs.add(f"{m.group(1)}: {m.group(2)}")
    return errs


def orm_debt(root):
    s = open(os.path.join(root, "server/.dependency-cruiser.cjs")).read()
    m = re.search(r"const ORM_DEBT =\s*'\^src/modules/\(([^)]*)\)", s)
    return set(m.group(1).split("|")) if m else None


def added_lines(patch_text, path_re):
    out, cur = [], None
    for line in patch_text.splitlines():
        if line.startswith("+++ "):
            cur = line[6:] if line.startswith("+++ b/") else None
        elif cur and re.search(path_re, cur) and line.startswith("+") and not line.startswith("+++"):
            out.append(line[1:])
    return out


def touched(patch_text):
    return re.findall(r"^\+\+\+ b/(.+)$", patch_text, flags=re.M)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--baseline-file")
    ap.add_argument("--case")
    ap.add_argument("--patch")
    ap.add_argument("--out")
    a = ap.parse_args()

    base_dir = os.path.join(a.work, "clean")
    base_file = a.baseline_file or os.path.join(a.work, "tsc-baseline.json")
    if a.baseline:
        export_head(a.repo, base_dir)
        errs = sorted(tsc_errors(base_dir))
        json.dump({"errors": errs, "orm_debt": sorted(orm_debt(base_dir) or [])}, open(base_file, "w"), indent=1)
        print(f"baseline: {len(errs)} type errors, ORM_DEBT={len(orm_debt(base_dir) or [])} entries")
        return

    baseline = json.load(open(base_file))
    root = os.path.join(a.work, "run")
    export_head(a.repo, root)
    patch_text = open(a.patch).read() if os.path.exists(a.patch) else ""
    checks = {}

    if not patch_text.strip():
        checks["patch_applies"] = {"passed": False, "evidence": "patch missing or empty"}
        json.dump(checks, open(a.out, "w"), indent=1)
        return
    rc, out = sh(f"git apply --whitespace=nowarn '{a.patch}'", root)
    checks["patch_applies"] = {"passed": rc == 0, "evidence": out.strip()[:300] or "applied cleanly"}
    if rc != 0:
        json.dump(checks, open(a.out, "w"), indent=1)
        return

    files = touched(patch_text)
    checks["files_touched"] = {"passed": True, "evidence": files}

    # --- common gates
    rc, out = sh("node_modules/.bin/depcruise src --config .dependency-cruiser.cjs --output-type err", os.path.join(root, "server"))
    viol = [l.strip() for l in out.splitlines() if l.strip().startswith("error ")]
    checks["arch_gate"] = {"passed": rc == 0, "evidence": viol or "no dependency violations"}

    new_err = sorted(tsc_errors(root) - set(baseline["errors"]))
    checks["no_new_type_errors"] = {"passed": not new_err, "evidence": new_err[:8] or "none vs. clean HEAD"}

    tests = [f for f in files if re.search(r"\.test\.ts$", f) and not f.endswith(".it.test.ts") and f.startswith("server/")]
    if tests:
        rel = " ".join(f[len("server/"):] for f in tests)
        rc, out = sh(f"node_modules/.bin/vitest run {rel}", os.path.join(root, "server"))
        tail = [l for l in out.splitlines() if re.search(r"Tests|Test Files|FAIL|Error", l)][:6]
        checks["new_hermetic_tests_pass"] = {"passed": rc == 0, "evidence": {"files": tests, "tail": tail}}
    else:
        checks["new_hermetic_tests_pass"] = {"passed": False, "evidence": "no new hermetic *.test.ts under server/"}

    debt_now, debt_was = orm_debt(root), set(baseline["orm_debt"])
    checks["orm_debt_not_grown"] = {"passed": debt_now is not None and debt_now <= debt_was,
                                    "evidence": {"added": sorted((debt_now or set()) - debt_was), "removed": sorted(debt_was - (debt_now or set()))}}

    # --- per case
    M = "server/src/modules/"
    if a.case == "polling":
        routes = open(os.path.join(root, M + "polling/routes.ts")).read()
        checks["routes_free_of_orm"] = {"passed": not re.search(r"drizzle-orm|db/schema", routes), "evidence": "imports of drizzle-orm / db/schema in polling/routes.ts" if re.search(r"drizzle-orm|db/schema", routes) else "none"}
        checks["debt_line_removed"] = {"passed": debt_now is not None and "polling/routes" not in debt_now, "evidence": sorted(debt_now or [])}
        have = lambda p: os.path.exists(os.path.join(root, M + "polling/" + p))
        checks["repository_and_service_created"] = {"passed": have("repository.ts") and have("service.ts"), "evidence": {"repository.ts": have("repository.ts"), "service.ts": have("service.ts")}}
        const = open(os.path.join(root, M + "polling/constants.ts")).read() if have("constants.ts") else ""
        checks["cooldown_literal_in_constants"] = {"passed": bool(re.search(r"\b60(_000)?\b", const)), "evidence": const.strip()[:200] or "no polling/constants.ts"}
    elif a.case == "stale":
        add = added_lines(patch_text, r"modules/pulls/routes\.ts$")
        bad = [l for l in add if re.search(r"container\.db|\.select\(|\beq\(|\band\(|\blt\(|\blte\(|t\.pullRequests|drizzle-orm", l)]
        checks["routes_add_no_orm"] = {"passed": not bad, "evidence": bad[:5] or "no query code added to pulls/routes.ts"}
        repo_add = added_lines(patch_text, r"modules/pulls/repository\.ts$")
        checks["query_in_repository_scoped"] = {"passed": any("workspaceId" in l for l in repo_add) and any("async " in l for l in repo_add), "evidence": repo_add[:6]}
        const_add = added_lines(patch_text, r"modules/pulls/constants\.ts$")
        checks["default_days_in_constants"] = {"passed": any(re.search(r"\b14\b", l) for l in const_add), "evidence": const_add[:4] or "pulls/constants.ts not touched"}
    elif a.case == "webhook":
        add_ports = added_lines(patch_text, r"vendor/shared/adapters\.ts$")
        checks["port_in_shared_adapters"] = {"passed": any(re.match(r"\s*export interface ", l) for l in add_ports), "evidence": add_ports[:4]}
        impl = [f for f in files if f.startswith("server/src/adapters/") and not f.endswith("mocks.ts") and not f.endswith(".test.ts")]
        checks["implementation_under_adapters"] = {"passed": bool(impl), "evidence": impl}
        cont = added_lines(patch_text, r"platform/container\.ts$")
        checks["container_override_and_accessor"] = {"passed": any("?:" in l for l in cont) and any(re.search(r"\b(get |async )", l) for l in cont), "evidence": cont[:8]}
        mock = added_lines(patch_text, r"adapters/mocks\.ts$")
        checks["mock_added"] = {"passed": any(re.search(r"class Mock\w+", l) for l in mock), "evidence": mock[:3]}
        env = [(f, l) for f in files if f.startswith("server/src/") and not f.endswith("platform/config.ts") and not f.endswith(".test.ts")
               for l in added_lines(patch_text, re.escape(f) + "$") if "process.env" in l]
        checks["no_process_env_outside_config"] = {"passed": not env, "evidence": env[:4] or "none"}
    json.dump(checks, open(a.out, "w"), indent=1, default=str)
    print({k: v["passed"] for k, v in checks.items()})


main()
