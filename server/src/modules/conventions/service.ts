import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type {
  ConventionCandidate,
  ConventionDraftGrouping,
  ConventionExtractionMode,
  ConventionsSnapshot,
  Provider,
  SkillDraft,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { ConventionsRepository, type ConventionRow } from './repository.js';
import {
  LlmConventionExtraction,
  buildExtractionMessages,
  buildSkillDrafts,
  extractLocalCandidates,
  toConventionDto,
  toScanDto,
  verifyEvidence,
  type LlmConventionCandidate,
  type SampledFile,
} from './helpers.js';
import {
  CONFIG_FILENAMES,
  CONFIG_SEARCH_SKIP_DIRS,
  CONVENTIONS_FALLBACK_MODEL,
  CONVENTIONS_FALLBACK_PROVIDER,
  CONVENTIONS_MAX_RETRIES,
  CONVENTIONS_SCHEMA_NAME,
  CONVENTIONS_TIMEOUT_MS,
  DEFAULT_SAMPLE_FILE_COUNT,
  MAX_CONFIG_FILE_BYTES,
  MAX_SAMPLE_FILE_BYTES,
} from './constants.js';

/**
 * Conventions service — repo convention extraction, review, and skill-draft
 * assembly (specs/lessons pasted brief). Persistence goes through
 * ConventionsRepository; pure transforms through helpers.ts; every literal
 * through constants.ts.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  /**
   * `local` parses config files into candidates deterministically, no model
   * call. `ai` samples files + configs (100% code, no LLM file-selection step)
   * → one cheap model call. `both` runs each independently and pools the
   * survivors. Every candidate, local or AI, is verified against what was
   * actually sampled before it survives; the pool then replaces the repo's
   * entire candidate set.
   */
  async extract(
    workspaceId: string,
    repoId: string,
    mode: ConventionExtractionMode,
  ): Promise<ConventionsSnapshot> {
    const repoRow = await this.repo.getRepoClonePath(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    if (!repoRow.clonePath) {
      throw new ValidationError('Repo has not been cloned yet');
    }
    const clonePath = repoRow.clonePath;
    const needsAi = mode === 'ai' || mode === 'both';
    const needsLocal = mode === 'local' || mode === 'both';

    const configPaths = await this.findConfigFiles(clonePath);
    const configFiles = await this.readFiles(clonePath, configPaths, MAX_CONFIG_FILE_BYTES);

    let sampleFiles: SampledFile[] = [];
    if (needsAi) {
      const samplePaths = await this.container.repoIntel.getConventionSamples(
        repoId,
        DEFAULT_SAMPLE_FILE_COUNT,
      );
      sampleFiles = await this.readFiles(clonePath, samplePaths, MAX_SAMPLE_FILE_BYTES);
    }

    if (needsLocal && !needsAi && configFiles.length === 0) {
      throw new ValidationError('No config files were found for local extraction');
    }
    if (needsAi && sampleFiles.length === 0 && configFiles.length === 0) {
      throw new ValidationError('No files were available to sample for this repo');
    }

    const sampledByPath = new Map<string, string>();
    for (const f of [...sampleFiles, ...configFiles]) sampledByPath.set(f.path, f.content);

    const survivors: LlmConventionCandidate[] = [];
    let provider: Provider | null = null;
    let model: string | null = null;

    if (needsLocal) {
      survivors.push(
        ...extractLocalCandidates(configFiles).filter((c) => verifyEvidence(c, sampledByPath).ok),
      );
    }

    if (needsAi) {
      const override = await this.repo.getFeatureModelOverride(workspaceId, 'conventions');
      provider = override?.provider ?? CONVENTIONS_FALLBACK_PROVIDER;
      model = override?.model ?? CONVENTIONS_FALLBACK_MODEL;

      const llm = await this.container.llm(provider);
      let raw: z.infer<typeof LlmConventionExtraction>;
      try {
        const result = await llm.completeStructured({
          model,
          schema: LlmConventionExtraction,
          schemaName: CONVENTIONS_SCHEMA_NAME,
          messages: buildExtractionMessages(sampleFiles, configFiles),
          maxRetries: CONVENTIONS_MAX_RETRIES,
          timeoutMs: CONVENTIONS_TIMEOUT_MS,
        });
        raw = result.data;
      } catch (err) {
        throw new ExternalServiceError('Convention extraction failed', {
          cause: err instanceof Error ? err.message : String(err),
        });
      }
      survivors.push(...raw.candidates.filter((c) => verifyEvidence(c, sampledByPath).ok));
    }

    const { scan, rows } = await this.repo.replaceAll(
      workspaceId,
      repoId,
      {
        sampleFileCount: sampleFiles.length,
        configFileCount: configFiles.length,
        mode,
        provider,
        model,
      },
      survivors.map((c) => ({
        category: c.category,
        rule: c.rule,
        evidencePath: c.evidence_path,
        evidenceStartLine: c.start_line,
        evidenceEndLine: c.end_line,
        evidenceSnippet: c.snippet,
        confidence: c.confidence,
      })),
    );

    return { scan: toScanDto(scan), candidates: rows.map(toConventionDto) };
  }

  /** No LLM call — just the latest persisted snapshot for the repo. */
  async list(workspaceId: string, repoId: string): Promise<ConventionsSnapshot> {
    const [scan, rows] = await Promise.all([
      this.repo.getLatestScan(workspaceId, repoId),
      this.repo.listByRepo(workspaceId, repoId),
    ]);
    return { scan: scan ? toScanDto(scan) : null, candidates: rows.map(toConventionDto) };
  }

  async patch(
    workspaceId: string,
    id: string,
    patch: {
      category?: ConventionCandidate['category'];
      rule?: string;
      evidence?: Partial<ConventionCandidate['evidence']>;
      status?: ConventionCandidate['status'];
    },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      category: patch.category,
      rule: patch.rule,
      evidencePath: patch.evidence?.path,
      evidenceStartLine: patch.evidence?.start_line,
      evidenceEndLine: patch.evidence?.end_line,
      evidenceSnippet: patch.evidence?.snippet,
      status: patch.status,
    });
    return row ? toConventionDto(row) : undefined;
  }

  /** Pure preview — never writes to the DB. Only accepted candidates may be drafted. */
  async draftSkills(
    workspaceId: string,
    repoId: string,
    candidateIds: string[],
    grouping: ConventionDraftGrouping,
  ): Promise<SkillDraft[]> {
    const repoRow = await this.repo.getRepoClonePath(workspaceId, repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const rows = await this.repo.listByIds(workspaceId, candidateIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const missing = candidateIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new NotFoundError('One or more conventions were not found', { missing });
    }
    const notFromRepo = rows.filter((r) => r.repoId !== repoId);
    if (notFromRepo.length > 0) {
      throw new ValidationError('All conventions must belong to the given repo');
    }
    const notAccepted = rows.filter((r) => r.status !== 'accepted');
    if (notAccepted.length > 0) {
      throw new ValidationError('Only accepted conventions can be turned into a skill', {
        ids: notAccepted.map((r) => r.id),
      });
    }

    // Preserve the caller's ordering rather than the DB's arbitrary row order.
    const ordered: ConventionRow[] = candidateIds.map((id) => byId.get(id)!);
    return buildSkillDrafts(ordered, grouping, repoRow.fullName);
  }

  /**
   * Probe well-known config filenames at the repo root AND one level into
   * every top-level directory — a multi-package repo (like this one) keeps
   * `tsconfig.json`/`eslint.config.*`/etc. inside each package, never at the
   * true root. `repoIntel`'s own sampler actively filters these out
   * (`isJunkPath`), so this reads them directly off the clone instead.
   * Missing files are silently skipped.
   */
  private async findConfigFiles(clonePath: string): Promise<string[]> {
    const found: string[] = [];
    for (const dir of ['', ...(await this.topLevelDirs(clonePath))]) {
      for (const name of CONFIG_FILENAMES) {
        const rel = dir ? `${dir}/${name}` : name;
        try {
          const st = await stat(join(clonePath, rel));
          if (st.isFile()) found.push(rel);
        } catch {
          // not present — skip
        }
      }
    }
    return found;
  }

  /** Top-level sub-directories of the clone, minus junk/build output. */
  private async topLevelDirs(clonePath: string): Promise<string[]> {
    try {
      const entries = await readdir(clonePath, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .filter((name) => !(CONFIG_SEARCH_SKIP_DIRS as readonly string[]).includes(name));
    } catch {
      return [];
    }
  }

  /** Read each path's content, skipping anything missing/unreadable/oversized. */
  private async readFiles(clonePath: string, paths: string[], maxBytes: number): Promise<SampledFile[]> {
    const out: SampledFile[] = [];
    for (const path of paths) {
      try {
        const st = await stat(join(clonePath, path));
        if (!st.isFile() || st.size > maxBytes) continue;
        const content = await readFile(join(clonePath, path), 'utf8');
        out.push({ path, content });
      } catch {
        // missing/unreadable — skip, never throw
      }
    }
    return out;
  }
}
