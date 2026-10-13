import { CI_BRANCH, OPENROUTER_SECRET_NAME, WORKFLOW_PATH } from './constants.js';

/**
 * Text of the pull request that adds the export. Fixed wording plus the repo name
 * and file count — no agent text, no token (NFR-12).
 */

const SECRETS_URL_SUFFIX = '/settings/secrets/actions';

export function buildPrBody(repoFullName: string, fileCount: number): string {
  return [
    'This pull request adds the DevDigest CI review to this repository.',
    '',
    `- Workflow: \`${WORKFLOW_PATH}\``,
    `- ${fileCount} files, committed on \`${CI_BRANCH}\``,
    '- Reviews run on pull requests from this repository (pull requests from other repositories are skipped).',
    '',
    `Before merging, add the repository secret \`${OPENROUTER_SECRET_NAME}\`: https://github.com/${repoFullName}${SECRETS_URL_SUFFIX}`,
    '`GITHUB_TOKEN` is provided by GitHub Actions.',
  ].join('\n');
}
