// Vendored copies: `<module>/src/vendor/<name>/` directories that exist in two or
// more modules under the same name are physical copies of one thing. This reports
// whether they still match — as a fact, not a defect: some drift is deliberate.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function hashTree(dir) {
  const files = new Map();
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      if (e.isSymbolicLink() || e.name === 'node_modules') continue;
      const p = join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        files.set(relative(dir, p).split(sep).join('/'), createHash('sha1').update(readFileSync(p)).digest('hex'));
      }
    }
  }
  return files;
}

export function compareVendorCopies(root, moduleDirs) {
  const byName = new Map(); // vendor name -> [{module, dir}]
  for (const m of moduleDirs) {
    const vendor = join(root, m, 'src', 'vendor');
    if (!existsSync(vendor)) continue;
    for (const e of readdirSync(vendor, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (!byName.has(e.name)) byName.set(e.name, []);
      byName.get(e.name).push({ module: m, dir: join(vendor, e.name) });
    }
  }

  const out = [];
  for (const [name, copies] of byName) {
    if (copies.length < 2) continue;
    const [base, ...rest] = copies;
    const baseFiles = hashTree(base.dir);
    for (const other of rest) {
      const otherFiles = hashTree(other.dir);
      const differing = [...baseFiles.keys()].filter((f) => otherFiles.has(f) && otherFiles.get(f) !== baseFiles.get(f));
      const onlyBase = [...baseFiles.keys()].filter((f) => !otherFiles.has(f));
      const onlyOther = [...otherFiles.keys()].filter((f) => !baseFiles.has(f));
      out.push({
        name,
        modules: [base.module, other.module],
        files: { [base.module]: baseFiles.size, [other.module]: otherFiles.size },
        differing,
        onlyIn: [
          { module: base.module, files: onlyBase },
          { module: other.module, files: onlyOther },
        ],
        identical: !differing.length && !onlyBase.length && !onlyOther.length,
      });
    }
  }
  return out;
}
