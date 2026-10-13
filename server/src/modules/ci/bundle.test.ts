import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listRunnerFiles, readRunnerFile, readRunnerFiles } from './bundle.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'ci-bundle-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function seed(files: Record<string, string>): Promise<void> {
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), body);
  }
}

const full = { 'index.js': 'console.log(1)', 'package.json': '{"type":"module"}', '382.index.js': 'chunk' };

describe('listRunnerFiles', () => {
  it('lists every file, sorted, with sizes and no contents (AC-31)', async () => {
    await seed({ ...full, 'sub/z.js': 'zz' });
    const list = await listRunnerFiles(dir);
    expect(list.map((f) => f.path)).toEqual(['382.index.js', 'index.js', 'package.json', 'sub/z.js']);
    expect(list.find((f) => f.path === 'sub/z.js')).toEqual({ path: 'sub/z.js', size_bytes: 2 });
    expect(list[0]).not.toHaveProperty('contents');
  });

  it('is deterministic (NFR-5)', async () => {
    await seed(full);
    expect(await listRunnerFiles(dir)).toEqual(await listRunnerFiles(dir));
  });

  it('throws runner_bundle_missing for a missing directory (EC-3)', async () => {
    await expect(listRunnerFiles(path.join(dir, 'nope'))).rejects.toMatchObject({
      code: 'runner_bundle_missing',
      statusCode: 409,
    });
  });

  it('throws for an empty directory', async () => {
    await expect(listRunnerFiles(dir)).rejects.toMatchObject({ code: 'runner_bundle_missing' });
  });

  it('throws when package.json is absent (the runner would fail in commonjs repos)', async () => {
    await seed({ 'index.js': 'x', '382.index.js': 'y' });
    await expect(listRunnerFiles(dir)).rejects.toMatchObject({ code: 'runner_bundle_missing' });
  });

  it('throws when index.js is absent', async () => {
    await seed({ 'package.json': '{}', '382.index.js': 'y' });
    await expect(listRunnerFiles(dir)).rejects.toMatchObject({ code: 'runner_bundle_missing' });
  });

  it('ignores .DS_Store and does not follow symlinks', async () => {
    await seed({ ...full, '.DS_Store': 'x' });
    await symlink('/etc/hosts', path.join(dir, 'link.js'));
    expect((await listRunnerFiles(dir)).map((f) => f.path)).not.toContain('.DS_Store');
    expect((await listRunnerFiles(dir)).map((f) => f.path)).not.toContain('link.js');
  });
});

describe('readRunnerFile', () => {
  it('reads a listed file by dist-relative or repository path', async () => {
    await seed(full);
    expect(await readRunnerFile(dir, 'index.js')).toBe('console.log(1)');
    expect(await readRunnerFile(dir, '.devdigest/runner/package.json')).toBe('{"type":"module"}');
  });

  it('refuses anything not in the listing (no traversal)', async () => {
    await seed(full);
    await writeFile(path.join(path.dirname(dir), 'outside.txt'), 'secret');
    for (const bad of ['../outside.txt', '/etc/passwd', 'sub/../../outside.txt', 'missing.js', '']) {
      await expect(readRunnerFile(dir, bad)).rejects.toMatchObject({ statusCode: 404 });
    }
    await rm(path.join(path.dirname(dir), 'outside.txt'), { force: true });
  });
});

describe('readRunnerFiles', () => {
  it('returns every file with contents in listing order', async () => {
    await seed(full);
    const files = await readRunnerFiles(dir);
    expect(files.map((f) => f.path)).toEqual(['382.index.js', 'index.js', 'package.json']);
    expect(files.find((f) => f.path === 'package.json')?.contents).toBe('{"type":"module"}');
  });
});
