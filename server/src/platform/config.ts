import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
/**
 * Project Context (SPEC-04) defaults. Globs use the small subset understood by
 * `modules/_shared/context-paths.ts` (double-star-slash incl. zero depth, `{a,b}`, `*`);
 * excludes are directory NAMES that block a path when any segment equals one.
 */
export const DEFAULT_CONTEXT_GLOBS = ['**/{specs,docs,insights}/**/*.md'];
export const DEFAULT_CONTEXT_EXCLUDES = ['node_modules', '.git', 'dist', 'build', 'vendor'];

/**
 * Split a comma-separated list on commas at brace depth 0 only, so `{a,b}`
 * groups survive. Items are trimmed; empties are dropped. Throws on unbalanced
 * or nested braces (the glob matcher supports one level of `{a,b}` only).
 */
export function splitTopLevelCommas(input: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const c of input) {
    if (c === '{') {
      depth += 1;
      if (depth > 1) throw new Error('nested "{" is not supported');
    } else if (c === '}') {
      depth -= 1;
      if (depth < 0) throw new Error('unbalanced "}"');
    }
    if (c === ',' && depth === 0) {
      items.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (depth !== 0) throw new Error('unbalanced "{"');
  items.push(current);
  return items.map((x) => x.trim()).filter((x) => x.length > 0);
}

/**
 * Comma-separated env list → trimmed non-empty items (commas inside `{…}` are
 * kept); unset/blank → default. Malformed braces fail config load with a zod issue.
 */
const CsvList = (fallback: string[]) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      let items: string[];
      try {
        items = splitTopLevelCommas(v ?? '');
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `invalid comma-separated list: ${e instanceof Error ? e.message : String(e)}`,
        });
        return z.NEVER;
      }
      return items.length > 0 ? items : fallback;
    });

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest:devdigest@localhost:5432/devdigest'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  // Project Context: which repo files can be attached to an agent or skill.
  CONTEXT_GLOBS: CsvList(DEFAULT_CONTEXT_GLOBS),
  CONTEXT_EXCLUDES: CsvList(DEFAULT_CONTEXT_EXCLUDES),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
});

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
  /** Globs (repo-relative, `/`-separated) a Project Context document must match. */
  contextGlobs: string[];
  /** Directory names excluded from Project Context scans and attachments. */
  contextExcludes: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
    contextGlobs: parsed.CONTEXT_GLOBS,
    contextExcludes: parsed.CONTEXT_EXCLUDES,
  };
}
