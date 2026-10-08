import type { Container } from '../../platform/container.js';
import { AppError } from '../../platform/errors.js';
import { RunExportRepository } from './repository.js';
import { toCsv, toExportLine, toPresetDto, type PresetDto } from './helpers.js';
import { EXPORT_MAX_ROWS } from './constants.js';

/**
 * Run-export service. Builds exports of past reviews and manages named presets.
 */
export class RunExportService {
  private readonly repo: RunExportRepository;

  constructor(container: Container) {
    this.repo = new RunExportRepository(container.db);
  }

  async createPreset(workspaceId: string, name: string, format: string): Promise<PresetDto> {
    try {
      const row = await this.repo.insertPreset(workspaceId, name, format);
      return toPresetDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('preset_exists', `A preset named "${name}" already exists`, 409);
      }
      throw err;
    }
  }

  async exportReviews(workspaceId: string, format: 'json' | 'csv') {
    const rows = await this.repo.listReviews(workspaceId, EXPORT_MAX_ROWS);
    const lines = rows.map(toExportLine);
    return format === 'csv' ? toCsv(lines) : lines;
  }
}
