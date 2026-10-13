Repo: /Users/harlock/Downloads/Sites/devdigest (DevDigest course starter; branch L06-homework). Read-only research.

Question: What is `pnpm verify:l06`? Find where it is defined (which package.json / script, in this branch, any other branch, any remote such as upstream course repo) and exactly what it checks — e.g. does it require the exact path `specs/eval-pipeline.md`? Does it check the `eval_cases`/`eval_runs` schema is unchanged or has particular columns? A minimum number of eval cases (≥8)? Specific routes like `POST /agents/:id/eval-runs`? Zero LLM calls in scoring? Specific file/function names?

Known so far: a grep of the working tree for `verify:l06|verify-l06` and `"verify` in all package.json found nothing. `evals/README.md:26` mentions an upstream branch `l06-evals`.

Try: `git branch -a`, `git remote -v`, `git log -S 'verify:l06' --oneline --all`, `git log --all --oneline | head -50`, `git show <ref>:<path>` for package.json files on other refs, `git ls-tree -r <ref> --name-only | grep -i verify`, `specs/lessons/` contents (esp. any L06 file), scripts/ dir. You may `git fetch` remotes if that is read-only (do not change branches or the working tree). If it lives in a public course repo reachable via the remote URL, you may look it up on the web.

Report: location (file:line or ref:path), the full list of checks it performs with evidence, and anything that constrains naming/paths/schema. If not found anywhere, say so plainly with what you searched.