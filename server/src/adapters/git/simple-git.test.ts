/* eslint-disable no-restricted-syntax -- the test hands a hermetic env to child git processes and prepends a `git` shim to PATH; it never reads configuration. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from './simple-git.js';
import { PR_CONTEXT_FETCH_TIMEOUT_MS, PR_CONTEXT_MAX_FILE_BYTES } from '../../modules/_shared/context-paths.js';

const LIMITS = {
  prContextMaxFileBytes: PR_CONTEXT_MAX_FILE_BYTES,
  prContextFetchTimeoutMs: PR_CONTEXT_FETCH_TIMEOUT_MS,
};

/**
 * SPEC-07 git adapter, against REAL throw-away repositories (hermetic: local
 * `git` only, no network, no Docker). Covers readFileAtCommit (AC-15, UI-2..4,
 * EC-4..7) and ensureCommit (EC-2, EC-3, NFR-3, UI-3).
 */

const posix = process.platform !== 'win32';
const REAL_GIT = posix ? execFileSync('which', ['git']).toString().trim() : 'git';

function git(cwd: string, args: string[]): string {
  return execFileSync(REAL_GIT, ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim();
}

let root: string;
let client: SimpleGitClient;
const repo = { owner: 'o', name: 'r' };
let sha: string;
const GITLINK_TARGET = '1'.repeat(40);

function put(rel: string, content: string | Buffer, workTree: string) {
  const p = join(workTree, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'simple-git-spec07-'));
  const work = join(root, 'clones', 'o', 'r');
  mkdirSync(work, { recursive: true });
  git(work, ['init', '-q', '-b', 'main']);
  put('docs/ok.md', '# hello\n', work);
  put('docs/a.md', 'a', work);
  put('docs/exec.md', '# exec\n', work);
  chmodSync(join(work, 'docs/exec.md'), 0o755);
  put('docs/big.md', Buffer.alloc(64 * 1024 + 1, 0x61), work);
  put('docs/exact.md', Buffer.alloc(64 * 1024, 0x61), work);
  put('docs/nul.md', Buffer.from([0x61, 0x00, 0x62]), work);
  put('docs/latin1.md', Buffer.from([0x66, 0xff, 0xfe, 0x67]), work);
  if (posix) symlinkSync('ok.md', join(work, 'docs/link.md'));
  git(work, ['add', '-A']);
  // A submodule is a gitlink (mode 160000) tree entry.
  git(work, ['update-index', '--add', '--cacheinfo', `160000,${GITLINK_TARGET},docs/sub.md`]);
  git(work, ['commit', '-q', '-m', 'init']);
  sha = git(work, ['rev-parse', 'HEAD']);
  client = new SimpleGitClient(join(root, 'clones'), LIMITS);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readFileAtCommit', () => {
  it('AC-15 / UI-2: reads a regular file by blob id (mode 100644) and returns text + blob id', async () => {
    const r = await client.readFileAtCommit(repo, sha, 'docs/ok.md');
    expect(r).toMatchObject({ ok: true, reason: 'ok', text: '# hello\n' });
    expect(r.ok && r.blobId).toMatch(/^[0-9a-f]{40}$/);
  });

  it.runIf(posix)('AC-15: an executable file (mode 100755) is readable', async () => {
    expect(await client.readFileAtCommit(repo, sha, 'docs/exec.md')).toMatchObject({ ok: true, text: '# exec\n' });
  });

  it('EC-4: a path absent at the commit is not_found', async () => {
    expect(await client.readFileAtCommit(repo, sha, 'docs/nope.md')).toEqual({ ok: false, reason: 'not_found' });
  });

  it.runIf(posix)('EC-5 / UI-4: a symlink is refused without resolving its target', async () => {
    expect(await client.readFileAtCommit(repo, sha, 'docs/link.md')).toEqual({ ok: false, reason: 'symlink' });
  });

  it('EC-5 / UI-4: a submodule (gitlink) is refused', async () => {
    expect(await client.readFileAtCommit(repo, sha, 'docs/sub.md')).toEqual({ ok: false, reason: 'submodule' });
  });

  it('EC-5: a directory (tree entry) is not a blob', async () => {
    expect(await client.readFileAtCommit(repo, sha, 'docs')).toEqual({ ok: false, reason: 'not_blob' });
  });

  it('EC-6 / AC-15: 64 KB + 1 byte is too_large, exactly 64 KB is read', async () => {
    expect(await client.readFileAtCommit(repo, sha, 'docs/big.md')).toEqual({ ok: false, reason: 'too_large' });
    const exact = await client.readFileAtCommit(repo, sha, 'docs/exact.md');
    expect(exact.ok).toBe(true);
  });

  it('EC-7: a NUL byte and invalid UTF-8 are not_utf8', async () => {
    expect(await client.readFileAtCommit(repo, sha, 'docs/nul.md')).toEqual({ ok: false, reason: 'not_utf8' });
    expect(await client.readFileAtCommit(repo, sha, 'docs/latin1.md')).toEqual({ ok: false, reason: 'not_utf8' });
  });

  it('UI-3: a commit that is not 40 lowercase hex never reaches git', async () => {
    for (const bad of ['HEAD', 'main', sha.toUpperCase(), sha.slice(0, 39), `${sha}; rm -rf /`, '--output=/tmp/x']) {
      expect(await client.readFileAtCommit(repo, bad, 'docs/ok.md')).toEqual({ ok: false, reason: 'fetch_failed' });
    }
  });

  it('UI-2: a path that is not in POSIX-normal form, or starts with ":", is refused', async () => {
    for (const bad of ['docs/../docs/ok.md', './docs/ok.md', 'docs//ok.md', ':(top)docs/ok.md', '']) {
      expect(await client.readFileAtCommit(repo, sha, bad)).toEqual({ ok: false, reason: 'not_found' });
    }
  });

  it('UI-2: pathspec magic is literal (a glob does not match a real file)', async () => {
    expect(await client.readFileAtCommit(repo, sha, 'docs/*.md')).toEqual({ ok: false, reason: 'not_found' });
    expect(await client.readFileAtCommit(repo, sha, 'docs/?.md')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('EC-3 / UI-10: a repo with no clone on disk maps to fetch_failed without throwing', async () => {
    const r = await client.readFileAtCommit({ owner: 'x', name: 'missing' }, sha, 'docs/ok.md');
    expect(r).toEqual({ ok: false, reason: 'fetch_failed' });
  });
});

describe('ensureCommit', () => {
  let origin: string;
  let shimDir: string;
  let fetchLog: string;
  let oldPath: string | undefined;
  let counter = 0;

  /** A fresh clone of `origin` (owner `e`, unique name) that lacks later origin commits. */
  function freshClone(): { repo: { owner: string; name: string }; client: SimpleGitClient } {
    const name = `c${counter++}`;
    const dest = join(root, 'ensure', 'e', name);
    mkdirSync(join(root, 'ensure', 'e'), { recursive: true });
    git(root, ['clone', '-q', '--no-local', origin, dest]);
    return { repo: { owner: 'e', name }, client: new SimpleGitClient(join(root, 'ensure'), LIMITS) };
  }

  const fetchCount = () =>
    existsSync(fetchLog)
      ? readFileSync(fetchLog, 'utf8')
          .split('\n')
          .filter((l) => /(^| )fetch( |$)/.test(l)).length
      : 0;

  let prHead: string;

  beforeAll(() => {
    origin = join(root, 'origin');
    mkdirSync(origin, { recursive: true });
    git(origin, ['init', '-q', '-b', 'main']);
    put('README.md', 'x', origin);
    git(origin, ['add', '-A']);
    git(origin, ['commit', '-q', '-m', 'base']);
    if (posix) {
      // A `git` shim on PATH that logs every invocation, then runs the real git.
      shimDir = join(root, 'shim');
      fetchLog = join(root, 'git-calls.log');
      mkdirSync(shimDir, { recursive: true });
      writeFileSync(join(shimDir, 'git'), `#!/bin/sh\necho "$@" >> "${fetchLog}"\nexec "${REAL_GIT}" "$@"\n`);
      chmodSync(join(shimDir, 'git'), 0o755);
    }
  });

  /** Push a PR head the clones do NOT have yet. */
  function newPrHead(n: number): string {
    git(origin, ['checkout', '-q', '-b', `pr-src-${n}`, 'main']);
    put(`specs/${n}.md`, `# spec ${n}\n`, origin);
    git(origin, ['add', '-A']);
    git(origin, ['commit', '-q', '-m', `pr ${n}`]);
    const head = git(origin, ['rev-parse', 'HEAD']);
    git(origin, ['update-ref', `refs/pull/${n}/head`, head]);
    git(origin, ['checkout', '-q', 'main']);
    git(origin, ['branch', '-q', '-D', `pr-src-${n}`]);
    return head;
  }

  it('EC-2: fetches a head commit the clone does not have, after which it is readable', async () => {
    prHead = newPrHead(7);
    const c = freshClone();
    expect(await c.client.readFileAtCommit(c.repo, prHead, 'specs/7.md')).toMatchObject({ ok: false });
    expect(await c.client.ensureCommit(c.repo, prHead, 7)).toEqual({ ok: true });
    expect(await c.client.readFileAtCommit(c.repo, prHead, 'specs/7.md')).toMatchObject({
      ok: true,
      text: '# spec 7\n',
    });
  });

  it('EC-2: a commit already present needs no fetch', async () => {
    const c = freshClone();
    const base = git(join(root, 'ensure', 'e', c.repo.name), ['rev-parse', 'HEAD']);
    expect(await c.client.ensureCommit(c.repo, base, 7)).toEqual({ ok: true });
  });

  it('UI-3: a non-40-hex commit or a non-positive PR number is refused before git runs', async () => {
    const c = freshClone();
    expect(await c.client.ensureCommit(c.repo, 'main', 7)).toEqual({ ok: false, reason: 'invalid_sha' });
    expect(await c.client.ensureCommit(c.repo, prHead.toUpperCase(), 7)).toEqual({ ok: false, reason: 'invalid_sha' });
    expect(await c.client.ensureCommit(c.repo, prHead, 0)).toEqual({ ok: false, reason: 'fetch_failed' });
    expect(await c.client.ensureCommit(c.repo, prHead, 1.5)).toEqual({ ok: false, reason: 'fetch_failed' });
  });

  it('EC-3 / UI-10: an unfetchable commit is fetch_failed and the result carries no git output or remote URL', async () => {
    const c = freshClone();
    const r = await c.client.ensureCommit(c.repo, 'f'.repeat(40), 99);
    expect(r).toEqual({ ok: false, reason: 'fetch_failed' });
    expect(JSON.stringify(r)).not.toContain(origin);
  });

  it.runIf(posix)('NFR-3: concurrent readers share ONE fetch (same number of git fetches as a single caller)', async () => {
    const head = newPrHead(8);
    oldPath = process.env.PATH;
    process.env.PATH = `${shimDir}:${oldPath}`;
    try {
      const single = freshClone();
      writeFileSync(fetchLog, '');
      expect(await single.client.ensureCommit(single.repo, head, 8)).toEqual({ ok: true });
      const baseline = fetchCount();
      expect(baseline).toBeGreaterThan(0);

      const many = freshClone();
      writeFileSync(fetchLog, '');
      const results = await Promise.all([
        many.client.ensureCommit(many.repo, head, 8),
        many.client.ensureCommit(many.repo, head, 8),
        many.client.ensureCommit(many.repo, head, 8),
      ]);
      expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
      expect(fetchCount()).toBe(baseline);
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it('NFR-3: two different SHAs on one clone never fetch at the same time', async () => {
    const a = newPrHead(11);
    const b = newPrHead(12);
    const c = freshClone();
    const proto = c.client as unknown as {
      doEnsureCommit: (...args: unknown[]) => Promise<unknown>;
    };
    const orig = proto.doEnsureCommit.bind(c.client);
    let active = 0;
    let maxActive = 0;
    proto.doEnsureCommit = async (...args: unknown[]) => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        return await orig(...args);
      } finally {
        active--;
      }
    };
    const results = await Promise.all([
      c.client.ensureCommit(c.repo, a, 11),
      c.client.ensureCommit(c.repo, b, 12),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(maxActive).toBe(1);
  });
});
