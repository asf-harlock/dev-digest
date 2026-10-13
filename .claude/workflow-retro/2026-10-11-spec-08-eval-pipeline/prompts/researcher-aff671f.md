External research (web), no repo changes.

Question: How do published benchmarks/evaluations of AI code-review agents compute precision when some of the agent's findings have no ground-truth label (unlabeled), and how do they treat negative cases ("must not flag" / known false positives)? Also how they match a predicted comment to an expected one (file + line overlap, line tolerance windows, semantic matching).

Sources to try: Qodo (PR-Agent) code review benchmark, CodeRabbit / Greptile / Graphite / Ellipsis eval blog posts, Martian code-review bench, SWE-bench-style or "CodeReviewer" (Microsoft) datasets, academic papers on LLM code review evaluation (2024–2026).

Context: we're scoring with pure code: a finding matches an expected case when the file matches and line ranges overlap. Cases come from user-accepted findings (must_find) and user-dismissed findings (must_not_flag). Two candidate precision definitions: (a) labeled-only TP/(TP+FP), FP = findings overlapping a must_not_flag region, unmatched findings reported separately as "unlabeled"; (b) every finding not matching a must_find is a false positive. Report which the sources use, with URLs, and a short recommendation.