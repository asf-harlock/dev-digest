/** Pure helpers for the markdown preview. */

/** Link/image URL schemes that can run script or smuggle a document (UI-5). */
const BLOCKED_SCHEME = /^\s*(javascript|data|vbscript):/i;

/** react-markdown `urlTransform`: blank out `javascript:`/`data:`/`vbscript:`
 *  URLs (whitespace/control-char obfuscation included); keep everything else. */
export function safeUrl(url: string): string {
  // eslint-disable-next-line no-control-regex
  const normalized = url.replace(/[\u0000-\u001f\u007f]/g, "");
  return BLOCKED_SCHEME.test(normalized) ? "" : url;
}
