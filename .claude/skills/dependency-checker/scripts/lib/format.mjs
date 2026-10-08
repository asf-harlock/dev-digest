// Formatting helpers shared by the renderer and the report checker.
// Pure functions only — nothing here touches the disk.

export const MB = 1024 * 1024;

// Binary units (1 MB = 1024 * 1024 B), the same base `du` uses.
export function fmtBytes(n) {
  if (n == null) return 'n/a';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${units[i]}`;
}

// Unicode bar scaled to the table's maximum; at least one block for any non-zero value.
export function bar(n, max, width = 10) {
  if (!n || !max) return '';
  return '█'.repeat(Math.max(1, Math.round((n / max) * width)));
}

// Markdown table cell: pipes and newlines would break the row.
export function cell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// Mermaid label text. Labels are always emitted inside double quotes, so a
// double quote is the only character that must not survive; angle brackets are
// escaped so a package name can never be read as an HTML tag.
export function mmText(s) {
  return String(s ?? '')
    .replace(/"/g, "'")
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Join label lines with Mermaid's line break.
export function mmLabel(...lines) {
  return lines.filter((l) => l != null && l !== '').map(mmText).join('<br/>');
}

export function pct(part, whole) {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

export function major(version) {
  const m = /^v?(\d+)/.exec(String(version ?? ''));
  return m ? Number(m[1]) : null;
}
