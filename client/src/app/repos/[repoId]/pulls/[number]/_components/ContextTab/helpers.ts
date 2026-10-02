/** Case-insensitive substring filter over repo-relative paths. */
export function filterPaths<T extends { path: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.path.toLowerCase().includes(q));
}

/** Returns a copy of `list` with the item at `index` moved by `delta`. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(index, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}
