## Hand-back 1

## External Research: precision with unlabeled findings, negative cases, and comment-to-label matching in AI code-review benchmarks

### Conclusion
Most published benchmarks use your definition (b): every finding that matches no golden label is a false positive. The one clear exception is GitHub ReviewBench. It reports a "grounded" precision using only existing labels (close to your (a)), and separately uses a judge to rule on unmatched findings. No published benchmark I found has a "must_not_flag" set built from dismissed findings. The nearest are clean-PR sets, where any comment counts as a false positive. Matching is usually an LLM judge. Pure-code location matching appears in only two sources, a ±5-line window and a plain range overlap, and both are used in a hybrid or two-tier scheme.

### Findings

**1. Which precision definition each source uses**

| Source | Treatment of unmatched findings | Closest to |
|---|---|---|
| Martian offline benchmark | Unmatched candidates are false positives. Duplicates are grouped first so they aren't counted twice. | (b) |
| Tenki | "We count them all against precision." Precision = caught / (caught + unmatched). | (b) |
| Augment | Comments not matching a golden comment are false positives. | (b) |
| SWR-Bench | FP = predicted change-points that hit no ground truth. | (b) |
| CR-Bench | Precision = Bug Hits / all reviews. Unmatched reviews are split into "Valid Suggestion" or "Noise", and both lower precision. | (b), plus a separate usefulness metric |
| GitHub ReviewBench | Grounded metrics use only gold labels. Augmented metrics have a judge decide whether unmatched findings are true or false positives. | (a), plus an extra step |
| Greptile (July 2025) | Reports only a catch rate (recall). False positives, style and unrelated comments don't affect the score. | Neither (no precision) |
| c-CRAB | Doesn't evaluate extra comments at all. | Neither |

- **Martian offline.** Precision is tool comments matching a golden comment divided by total tool comments. The README lists unmatched candidates as `false_positives`. It warns that "tools that flag many correct style issues will still see some counted as false positives". It also warns that the golden set may miss edge cases. Matches to golden comments in excluded categories are "neither rewarded nor penalized".
- **Martian online.** Ground truth is what developers changed after the bot's comment. Precision is bot suggestions matched to real fixes divided by all suggestions. This is the closest published analogue to your user-accepted findings. It still treats every unmatched suggestion as imprecise.
- **Tenki.** Its blog states that splitting out a "plausible but unverified" bucket would need hand-labeling.
- **ReviewBench.** It calls grounded recall the headline cross-system number. Augmented recall is a per-system diagnostic, because its denominator changes with each agent's findings. A finding counts as a true positive only if it is "true, relevant, and non-trivial".

**2. Negative cases ("must not flag")**
- No fixed list of known false positives exists in any benchmark I found.
- SWR-Bench pairs 500 Change-PRs with 500 Clean-PRs. A search summary says any comment on a clean PR is counted as a false positive. The paper's own FP definition (any prediction hitting no ground truth) implies this, but the paper doesn't say it explicitly. I did not fetch the DoorDash or kluster pages, so I can't quote their rules. A search summary says kluster counts any claimed bug on bug-fix or clean samples as a false positive, and that DoorDash uses a near-zero-findings "benign" set.
- CR-Bench and c-CRAB describe no clean or negative samples.
- ReviewBench describes no must-not-flag set.
- Martian offline has no negative set, but it notes the golden set has few style comments.

**3. Matching a predicted comment to an expected one**
- **Semantic LLM judge, no location rule stated:**
  - Martian offline asks "Do these describe the same underlying issue?". The README says file and line don't affect matching.
  - SWR-Bench uses an LLM to decide whether each ground-truth change-point was "semantically identified". Hit agreement among 3 humans and 2 LLMs was 89.2–94.9%. The judge was Gemini-2.5-Flash.
  - CR-Bench uses Claude-Sonnet-4.5. The judge is given the bug description, the files modified in the fix, and the comment. The paper reports no agreement check against humans.
- **Three-judge vote plus a location requirement.** Tenki uses two-of-three LLM judges. A hit needs a line-level comment that identifies the faulty code and explains the impact. Summary-only mentions and comments on the wrong file don't count. It gives no numeric line tolerance.
- **Deterministic first pass with a line window.** The 2026 arXiv paper "Bigger Isn't Always Better" requires a normalized file-path match, a line range overlapping within a ±5-line tolerance, and a compatible comment type. Those matches become true positives. Findings with no file match become false positives. Findings matching the file but missing on line or type go to an LLM judge (Claude Opus 4.6, temperature 0), where a partial match counts as 0.5 TP. The paper gives no explicit precision formula, and it doesn't say how the 0.5 enters the denominator. (Caveat: I read this via a fetch summary of the HTML version, not the paper text directly.)
- **Plain range overlap plus semantic check.** AACR-Bench counts a comment as "Line Correct" if its line range overlaps a ground-truth comment's range. "Semantically Correct" additionally requires the content to match, judged with Qwen3-235B. The excerpt I read gives no precision formula or treatment of unmatched comments. I did not read the last ~18k characters of the HTML.
- **No location at all.** c-CRAB credits a review when a coding agent guided by it revises the patch so a human-derived test passes. It measures no precision.
- I found no source that publishes a justification for its tolerance window or tests sensitivity to window size.

### Recommendation
This is my judgement, not something a source states.
- **Headline metric: (a), with the unlabeled count always shown next to it.** ReviewBench's grounded-versus-augmented split is the nearest published precedent. Your labels come from user actions, so any unmatched finding is genuinely unknown. Counting it as a false positive (b) would punish the tool for real issues the user never tagged. Tenki and Martian accept this inflation because they have no better option.
- **Also report (b) as a lower bound, labeled as such.** That keeps your numbers comparable with Martian-style benchmarks. Also report the unlabeled rate: unlabeled / all findings.
- **Show the denominators.** Labeled-only precision can rest on a handful of must_not_flag hits. Print TP, FP and unlabeled counts alongside the ratio, and treat precision as undefined when TP+FP is 0.
- **Matching rule.** Your file-plus-range-overlap rule has precedent in AACR-Bench's line-correct test. The ±5 window is the only published tolerance. Define explicitly what happens when a finding overlaps both a must_find and a must_not_flag region, because no source covers this.
- **Your dismissed-finding labels are unusual.** They are real human negatives for specific findings, unlike the clean-PR approach. That is a stronger signal than anything in the literature I found.

### Sources
- ReviewBench: An open benchmark for AI code review — https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/ (2026) — grounded versus augmented metrics, judge ruling on unmatched findings. The matcher isn't described. The page says "four metrics" in one place and six in another.
- Martian code-review-benchmark README — https://github.com/withmartian/code-review-benchmark (page and `offline/README.md`, fetched 2026-10) — unmatched = false positive, semantic judge, dedup step, category profiles, online ground truth is developer fixes.
- Greptile on Martian — https://www.greptile.com/content-library/greptile-martian-code-review-benchmark — vendor, secondary. Precision and recall definitions for the online benchmark.
- Greptile benchmarks methodology — https://www.greptile.com/benchmarks.md (2025) — vendor-run. Line-level catch criterion. Extra comments don't affect the catch rate.
- Tenki, benchmarking AI code reviewers — https://tenki.cloud/blog/benchmarking-ai-code-reviewers — vendor. Three-judge vote, all unmatched count against precision, no line tolerance given.
- Augment, 7-tool benchmark — https://augmentcode.com/blog/we-benchmarked-7-ai-code-review-tools-on-real-world-prs-here-are-the-results (Dec 2025) — vendor. Unmatched = false positive. Matching method not described.
- SWR-Bench — https://arxiv.org/html/2509.01494v1 — Precision = TP/(TP+FP), FP defined as above, semantic hit matching, judge agreement figures. Clean-PR handling inferred, not stated.
- CR-Bench (arXiv 2603.11078) — https://arxiv.org/html/2603.11078v1 and https://www.iclr.cc/virtual/2026/10017268 — Bug Hit / Valid Suggestion / Noise, precision over all reviews, no negative samples.
- "Bigger Isn't Always Better" — https://arxiv.org/html/2606.15689 — ±5-line deterministic matching plus an LLM fallback.
- AACR-Bench — https://arxiv.org/html/2601.19494 — line-range overlap rule. Precision and unmatched treatment not seen in the excerpt.
- c-CRAB (arXiv 2603.23448) — https://arxiv.org/html/2603.23448 — test-based matching, no precision, extra comments not evaluated.
- Qodo benchmark page — https://qodo.ai/ai-code-review-benchmark/ — vendor. Gives no formulas or matching rules on the page. It links to a methodology blog and dataset that I did not fetch.
- Search-result summaries only (page not fetched, so not citable for specifics): kluster.ai/blog/code-review-benchmark (fetch failed on DNS), the DoorDash careers post, benchmarklist.com SWE-PRBench (the page I fetched doesn't define matching or FPR).

### Could not determine
- Qodo's exact matching and precision rules. The benchmark page doesn't state them, and I didn't fetch its methodology blog or the dataset repo (qodo.ai/blog/how-we-built-a-real-world-benchmark-for-ai-code-review).
- The full definitions in the ±5-line paper and AACR-Bench: how the 0.5 partial credit enters precision, and how AACR-Bench treats unmatched comments. These are in the full papers.
- CodeReviewer (Microsoft) was not researched, because it scores text similarity (BLEU) rather than precision. Its omission is not a finding.
- CodeRabbit, Graphite and Ellipsis eval posts. I found no primary eval methodology from them in the searches, so I did not cover them.
- Whether any benchmark has a human-dismissed-findings negative set. I found none, but that is an absence of evidence from a limited search.
- Martian offline's golden-comment counts conflict between two summaries (136 in one, 173 in another). I did not resolve it, and it doesn't affect the answer.