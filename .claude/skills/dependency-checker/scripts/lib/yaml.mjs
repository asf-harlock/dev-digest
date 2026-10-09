// A deliberately small YAML reader — just enough for pnpm-lock.yaml v9.
// Supported: indentation-nested maps, `- scalar` lists, quoted keys/values.
// NOT supported (kept as raw strings): flow collections `{ a: b }` / `[a, b]`,
// multi-line scalars, anchors. Every scalar comes back as a string, so a
// version like `1.0` is never turned into a number.

function unquote(s) {
  if (s.length >= 2 && s[0] === "'" && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s[0] === '"' && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

function splitKey(line) {
  const q = /^(['"])((?:\\.|(?!\1).|'')*)\1:(?:\s+(.*))?$/.exec(line);
  if (q) return { key: unquote(q[1] + q[2] + q[1]), rest: (q[3] ?? '').trim() };
  const idx = line.search(/:(\s|$)/);
  if (idx < 0) return null;
  return { key: line.slice(0, idx), rest: line.slice(idx + 1).trim() };
}

export function parseYamlSubset(text) {
  const root = {};
  // frame.holder[frame.key] === frame.node; the node is created lazily so the
  // first child line decides whether it is a list or a map.
  const stack = [{ indent: -1, holder: null, key: null, node: root }];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const frame = stack[stack.length - 1];

    if (frame.node === null) {
      frame.node = line.startsWith('- ') || line === '-' ? [] : {};
      frame.holder[frame.key] = frame.node;
    }

    if (Array.isArray(frame.node)) {
      frame.node.push(unquote(line.replace(/^-\s*/, '')));
      continue;
    }

    const kv = splitKey(line);
    if (!kv) continue;
    if (kv.rest === '') {
      frame.node[kv.key] = null;
      stack.push({ indent, holder: frame.node, key: kv.key, node: null });
    } else {
      frame.node[kv.key] = unquote(kv.rest);
    }
  }
  return root;
}
