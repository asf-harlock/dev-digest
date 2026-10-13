import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { checkIngestArtifact } from './ingest.js';

const SHA = 'a'.repeat(40);
const REPO = 'acme/payments-api';
const result = {
  findings_count: 3,
  critical: 1,
  warning: 1,
  suggestion: 1,
  cost_usd: 0.02,
  duration_ms: 1234,
  agent: 'Totally Legit Agent',
  version: '1',
  pr_number: 7,
};
const meta = { commit_sha: SHA, repository: REPO, pr_number: 7 };

function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
}
const good = (r: object = result, m: object = meta, extra: Record<string, string> = {}) =>
  zip({ 'devdigest-result.json': JSON.stringify(r), 'devdigest-run.json': JSON.stringify(m), ...extra });
const check = (zipBytes: Uint8Array, over: Partial<Parameters<typeof checkIngestArtifact>[0]> = {}) =>
  checkIngestArtifact({ zipBytes, headSha: SHA, installationRepo: REPO, ...over });

describe('checkIngestArtifact', () => {
  it('accepts a valid artifact and drops the agent text (UI-9)', () => {
    const r = check(good());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.artifact).toEqual({
        findings_count: 3,
        critical: 1,
        warning: 1,
        suggestion: 1,
        cost_usd: 0.02,
        duration_ms: 1234,
        pr_number: 7,
      });
      expect(r.artifact).not.toHaveProperty('agent');
      expect(r.meta).toEqual(meta);
    }
  });

  it('treats null severity counts as 0 and null duration as null', () => {
    const r = check(good({ findings_count: 0, cost_usd: null, pr_number: 7, agent: 'x' }));
    expect(r.ok && r.artifact).toMatchObject({ critical: 0, warning: 0, suggestion: 0, cost_usd: null, duration_ms: null });
  });

  it('compares the sha and repository case-insensitively', () => {
    const r = check(good(result, { ...meta, commit_sha: SHA.toUpperCase(), repository: 'ACME/Payments-API' }));
    expect(r.ok).toBe(true);
  });

  it('ignores unknown entries without reading them (EC-19)', () => {
    // A 300 KiB unknown entry would break the size limit if it were read.
    const r = check(good(result, meta, { 'extra.txt': 'x'.repeat(300 * 1024), 'nested/other.json': '{}' }));
    expect(r.ok).toBe(true);
  });

  it('rejects more than 64 entries (EC-20)', () => {
    const many = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`f${i}.txt`, 'x']));
    expect(check(good(result, meta, many))).toMatchObject({ ok: false, reason: 'artifact_rejected' });
  });

  it('accepts exactly 64 entries', () => {
    const many = Object.fromEntries(Array.from({ length: 62 }, (_, i) => [`f${i}.txt`, 'x']));
    expect(check(good(result, meta, many)).ok).toBe(true);
  });

  it('rejects an entry over 256 KiB after inflation (EC-20)', () => {
    const big = JSON.stringify({ ...result, agent: 'x'.repeat(300 * 1024) });
    expect(check(good(JSON.parse(big)))).toMatchObject({ ok: false, reason: 'artifact_rejected' });
  });

  it.each(['/abs/path.txt', '../evil.txt', 'a/../../evil.txt', 'C:\\evil.txt', '\\\\unc\\share'])(
    'rejects an unsafe entry path %s (EC-20)',
    (name) => {
      expect(check(good(result, meta, { [name]: 'x' }))).toMatchObject({ ok: false, reason: 'artifact_rejected' });
    },
  );

  it('rejects a compressed size above 16 MiB (EC-20)', () => {
    const r = check(new Uint8Array(16 * 1024 * 1024 + 1));
    expect(r).toMatchObject({ ok: false, reason: 'artifact_rejected' });
  });

  it('rejects garbage bytes', () => {
    expect(check(new Uint8Array([1, 2, 3, 4]))).toMatchObject({ ok: false, reason: 'artifact_rejected' });
  });

  it('rejects when an entry is missing or not JSON', () => {
    expect(check(zip({ 'devdigest-result.json': JSON.stringify(result) })).ok).toBe(false);
    expect(check(zip({ 'devdigest-run.json': JSON.stringify(meta) })).ok).toBe(false);
    expect(check(zip({ 'devdigest-result.json': 'nope', 'devdigest-run.json': JSON.stringify(meta) })).ok).toBe(false);
  });

  it('rejects a result that fails the schema (EC-21)', () => {
    expect(check(good({ ...result, findings_count: 'three' })).ok).toBe(false);
    expect(check(good(result, { commit_sha: SHA })).ok).toBe(false);
  });

  it('rejects numbers out of bounds (UI-8)', () => {
    expect(check(good({ ...result, findings_count: -1 })).ok).toBe(false);
    expect(check(good({ ...result, findings_count: 1_000_000 })).ok).toBe(false);
    expect(check(good({ ...result, cost_usd: -0.01 })).ok).toBe(false);
    expect(check(good({ ...result, cost_usd: 1e9 })).ok).toBe(false);
    expect(check(good({ ...result, duration_ms: -5 })).ok).toBe(false);
    expect(check(good({ ...result, duration_ms: 1e12 })).ok).toBe(false);
    expect(check(good({ ...result, critical: 99 })).ok).toBe(false); // severities exceed the total
  });

  it('rejects a sidecar that disagrees with the run (EC-21)', () => {
    expect(check(good(result, { ...meta, commit_sha: 'b'.repeat(40) })).ok).toBe(false);
    expect(check(good(result, { ...meta, repository: 'evil/repo' })).ok).toBe(false);
    expect(check(good(result, { ...meta, pr_number: 8 })).ok).toBe(false);
  });

  it('rejects a missing artifact pr_number and a pr number that differs from the run', () => {
    expect(check(good({ ...result, pr_number: null })).ok).toBe(false);
    expect(check(good(), { installationPrNumber: 9 }).ok).toBe(false);
    expect(check(good(), { installationPrNumber: 7 }).ok).toBe(true);
    expect(check(good(), { installationPrNumber: null }).ok).toBe(true);
  });

  it('rejects a pr_number outside 1..2147483647 in the artifact or the sidecar (S1)', () => {
    const big = 99_999_999_999;
    expect(check(good({ ...result, pr_number: big }, { ...meta, pr_number: big })).ok).toBe(false);
    expect(check(good({ ...result, pr_number: 2_147_483_648 }, { ...meta, pr_number: 2_147_483_648 })).ok).toBe(false);
    expect(check(good({ ...result, pr_number: 0 }, { ...meta, pr_number: 0 })).ok).toBe(false);
    expect(check(good({ ...result, pr_number: -3 }, { ...meta, pr_number: -3 })).ok).toBe(false);
    expect(check(good({ ...result, pr_number: 2_147_483_647 }, { ...meta, pr_number: 2_147_483_647 })).ok).toBe(true);
  });

  it('does not inflate beyond a lying declared size', () => {
    const z = zip({ 'devdigest-result.json': 'A'.repeat(5 * 1024 * 1024), 'devdigest-run.json': JSON.stringify(meta) });
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    for (let i = 0; i < z.length - 4; i++) {
      const sig = dv.getUint32(i, true);
      if (sig === 0x04034b50) dv.setUint32(i + 22, 10, true);
      if (sig === 0x02014b50) dv.setUint32(i + 24, 10, true);
    }
    expect(check(z).ok).toBe(false);
  });
});
