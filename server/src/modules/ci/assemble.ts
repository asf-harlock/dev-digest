import type { CiPreview, CiPreviewFile, CiPreviewWarning, Provider } from '@devdigest/shared';
import {
  MEMORY_PATH,
  PREVIEW_NOTE_MEMORY_EMPTY,
  PREVIEW_NOTE_RUNNER,
  SKILL_SLUG_FALLBACK,
  WORKFLOW_PATH,
  WORKFLOW_VERSION,
} from './constants.js';
import { runnerRepoPath, uniqueSlugs } from './helpers.js';
import { buildManifestYaml, manifestPath, skillPath, type ManifestAgent } from './manifest.js';
import { buildMemoryExport, type MemoryExportRow } from './memory-export.js';
import { buildWorkflowYaml, type WorkflowOptions } from './workflow.js';
import type { RunnerFileInfo } from './bundle.js';

/**
 * Pure assembly of the export file list (NFR-5: the same inputs give the same
 * bytes, in the same order). No I/O — the caller reads the runner dist, the
 * skills and the memory rows and passes them in.
 */

export interface AssembleInput {
  agent: ManifestAgent;
  /** Slug of the manifest file; reused from the existing installation on Update. */
  manifestSlug: string;
  /** Enabled skills (link and skill both enabled), in link order. */
  skills: ReadonlyArray<{ name: string; body: string }>;
  memoryRows: readonly MemoryExportRow[];
  /** The repository's total repo-scope memory rows (before the 500 cap). */
  memoryTotal?: number;
  /** Runner files; `contents` is omitted for a preview (read on demand). */
  runnerFiles: ReadonlyArray<RunnerFileInfo & { contents?: string }>;
  workflow: WorkflowOptions;
  /** Hand-edited workflow text, already validated by `validateWorkflowYaml`. Replaces the generated one. */
  workflowOverride?: string;
}

export interface ExportFile {
  path: string;
  kind: CiPreviewFile['kind'];
  editable: boolean;
  /** Null only for a runner file whose contents were not supplied. */
  contents: string | null;
  size_bytes: number;
  note: string | null;
}

export interface AssembledExport {
  files: ExportFile[];
  warnings: CiPreviewWarning[];
}

function textFile(
  path: string,
  kind: ExportFile['kind'],
  contents: string,
  editable = false,
  note: string | null = null,
): ExportFile {
  return { path, kind, editable, contents, size_bytes: Buffer.byteLength(contents, 'utf8'), note };
}

/** File order: manifest, skills (link order), memory, workflow, runner (sorted). */
export function assembleExport(input: AssembleInput): AssembledExport {
  const skillSlugs = uniqueSlugs(
    input.skills.map((s) => s.name),
    SKILL_SLUG_FALLBACK,
  );
  const memory = buildMemoryExport(input.memoryRows, input.memoryTotal);
  const workflowText = input.workflowOverride ?? buildWorkflowYaml(input.workflow);

  const files: ExportFile[] = [
    textFile(manifestPath(input.manifestSlug), 'manifest', buildManifestYaml(input.agent, skillSlugs)),
    ...input.skills.map((skill, i) => textFile(skillPath(skillSlugs[i]!), 'skill', skill.body)),
    textFile(
      MEMORY_PATH,
      'memory',
      memory.contents,
      false,
      memory.empty
        ? PREVIEW_NOTE_MEMORY_EMPTY
        : memory.truncated
          ? `newest ${memory.count} of ${memory.total}`
          : null,
    ),
    textFile(WORKFLOW_PATH, 'workflow', workflowText, true),
    ...input.runnerFiles.map(
      (f): ExportFile => ({
        path: runnerRepoPath(f.path),
        kind: 'runner',
        editable: false,
        contents: f.contents ?? null,
        size_bytes: f.contents === undefined ? f.size_bytes : Buffer.byteLength(f.contents, 'utf8'),
        note: PREVIEW_NOTE_RUNNER,
      }),
    ),
  ];

  return { files, warnings: warningsFor(input.agent.provider, memory) };
}

function warningsFor(
  provider: Provider,
  memory: ReturnType<typeof buildMemoryExport>,
): CiPreviewWarning[] {
  const warnings: CiPreviewWarning[] = [];
  if (provider !== 'openrouter') warnings.push({ code: 'provider_not_openrouter' });
  if (memory.truncated) warnings.push({ code: 'memory_truncated', count: memory.total });
  if (memory.empty) warnings.push({ code: 'memory_empty' });
  return warnings;
}

/** The `CiPreview` response for an assembled export. */
export function toPreview(assembled: AssembledExport): CiPreview {
  return {
    files: assembled.files.map((f) => ({
      path: f.path,
      kind: f.kind,
      editable: f.editable,
      contents: f.kind === 'runner' ? null : f.contents,
      size_bytes: f.size_bytes,
      note: f.note,
    })),
    file_count: assembled.files.length,
    workflow_version: WORKFLOW_VERSION,
    warnings: assembled.warnings,
  };
}

/** Files for a commit or a zip. Throws if any file has no contents (a preview-only assembly). */
export function toCommitFiles(assembled: AssembledExport): Array<{ path: string; contents: string }> {
  return assembled.files.map((f) => {
    if (f.contents === null) throw new Error(`Export file has no contents: ${f.path}`);
    return { path: f.path, contents: f.contents };
  });
}
