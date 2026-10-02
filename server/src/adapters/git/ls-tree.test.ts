import { describe, it, expect } from 'vitest';
import { parseLsTreeEntry } from './ls-tree.js';

const OID = 'a'.repeat(40);

describe('parseLsTreeEntry', () => {
  it('parses a blob record', () => {
    const out = `100644 blob ${OID}     123\tdocs/a.md\0`;
    expect(parseLsTreeEntry(out, 'docs/a.md')).toEqual({
      mode: '100644',
      type: 'blob',
      oid: OID,
      size: 123,
      path: 'docs/a.md',
    });
  });

  it('parses a submodule and a tree (size "-")', () => {
    expect(parseLsTreeEntry(`160000 commit ${OID}       -\tsub\0`, 'sub')?.type).toBe('commit');
    expect(parseLsTreeEntry(`040000 tree ${OID}       -\tdocs\0`, 'docs')?.size).toBeNull();
  });

  it('returns null for empty output and for a different path', () => {
    expect(parseLsTreeEntry('', 'a.md')).toBeNull();
    expect(parseLsTreeEntry(`100644 blob ${OID}      1\tb.md\0`, 'a.md')).toBeNull();
  });

  it('keeps paths with spaces and quotes raw', () => {
    const p = 'docs/"x y".md';
    expect(parseLsTreeEntry(`100644 blob ${OID}      1\t${p}\0`, p)?.path).toBe(p);
  });
});
