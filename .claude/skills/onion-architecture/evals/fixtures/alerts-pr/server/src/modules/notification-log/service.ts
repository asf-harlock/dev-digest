import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { NotificationLogRepository } from './repository.js';
import { clampPageSize, dedupeKeyFor, toNotificationLogDto, type NotificationLogDto } from './helpers.js';
import { LOG_MAX_PAGE_SIZE, LOG_PAGE_SIZE } from './constants.js';

/**
 * Notification-log service. Records that a finding was announced on a channel
 * and pages through the history.
 */
export class NotificationLogService {
  private readonly repo: NotificationLogRepository;

  constructor(container: Container) {
    this.repo = new NotificationLogRepository(container.db);
  }

  async page(workspaceId: string, before: Date | undefined, size?: number): Promise<NotificationLogDto[]> {
    const rows = await this.repo.page(workspaceId, before, clampPageSize(size, LOG_PAGE_SIZE, LOG_MAX_PAGE_SIZE));
    return rows.map(toNotificationLogDto);
  }

  async record(workspaceId: string, reviewId: string, findingId: string, channel: string): Promise<NotificationLogDto> {
    const findings = await this.repo.findingsForReview(workspaceId, reviewId);
    const finding = findings.find((f) => f.id === findingId);
    if (!finding) throw new NotFoundError('Finding not found in this review');
    const row = await this.repo.append(workspaceId, dedupeKeyFor(finding, channel), channel, finding.id);
    return toNotificationLogDto(row);
  }
}
