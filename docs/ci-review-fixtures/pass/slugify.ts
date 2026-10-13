/**
 * CI review fixture (clean): a small pure helper with no I/O, no secrets and
 * no untrusted input reaching a sink. Used to show a review that passes.
 */
const MAX_SLUG_LENGTH = 64;

export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
}
