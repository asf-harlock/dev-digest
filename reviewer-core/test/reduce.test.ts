import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { verdictFromFindings } from '../src/review/reduce.js';

/**
 * verdictFromFindings — the deterministic mapping every reviewer prompt
 * already documents as a convention (request_changes ⇔ ≥1 CRITICAL; comment
 * ⇔ only WARNING/SUGGESTION; approve ⇔ no findings). Pinned here because the
 * model's OWN `verdict` field is never read for anything the pipeline
 * persists (see run.ts) — this function is the actual source of truth.
 */

function finding(severity: Finding['severity']): Finding {
  return {
    id: `f-${severity}`,
    severity,
    category: 'bug',
    title: 't',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
  };
}

describe('verdictFromFindings', () => {
  it('no findings ⇒ approve', () => {
    expect(verdictFromFindings([])).toBe('approve');
  });

  it('only WARNING/SUGGESTION ⇒ comment', () => {
    expect(verdictFromFindings([finding('WARNING'), finding('SUGGESTION')])).toBe('comment');
  });

  it('any CRITICAL ⇒ request_changes, regardless of what else is present', () => {
    expect(verdictFromFindings([finding('SUGGESTION'), finding('CRITICAL'), finding('WARNING')])).toBe(
      'request_changes',
    );
  });

  it('a single CRITICAL alone ⇒ request_changes', () => {
    expect(verdictFromFindings([finding('CRITICAL')])).toBe('request_changes');
  });
});
