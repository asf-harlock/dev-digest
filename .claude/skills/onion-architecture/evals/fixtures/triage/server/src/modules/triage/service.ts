import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { AgentsService } from '../agents/service.js';
import { TriageRepository } from './repository.js';
import { toTriagedFinding, truncateReason, type TriagedFinding } from './helpers.js';
import { DISMISS_REASON_MAX_LENGTH, TRIAGE_BATCH_LIMIT } from './constants.js';

/**
 * Triage service. Accept / dismiss findings and list what is still open for a
 * review. Dismissals on findings that an agent gates CI on are logged.
 */
export class TriageService {
  private readonly repo: TriageRepository;
  private readonly agents: AgentsService;

  constructor(private readonly container: Container) {
    this.repo = new TriageRepository(container.db);
    this.agents = new AgentsService(container);
  }

  async accept(req: FastifyRequest, findingId: string): Promise<TriagedFinding> {
    const finding = await this.repo.getFinding(findingId);
    if (!finding) throw new NotFoundError('Finding not found');
    await this.repo.markAccepted(findingId, new Date());
    req.log.info({ findingId }, 'finding accepted');
    return toTriagedFinding({ ...finding, acceptedAt: new Date(), dismissedAt: null });
  }

  async dismiss(
    req: FastifyRequest,
    workspaceId: string,
    findingId: string,
    reason: string,
  ): Promise<TriagedFinding> {
    const finding = await this.repo.getFinding(findingId);
    if (!finding) throw new NotFoundError('Finding not found');
    const gated = await this.agents.gatesCi(workspaceId, finding.severity);
    if (gated) {
      req.log.warn(
        { findingId, reason: truncateReason(reason, DISMISS_REASON_MAX_LENGTH) },
        'dismissed a CI-gating finding',
      );
    }
    await this.repo.markDismissed(findingId, new Date());
    return toTriagedFinding({ ...finding, dismissedAt: new Date(), acceptedAt: null });
  }

  async listOpen(workspaceId: string, reviewId: string): Promise<TriagedFinding[]> {
    const rows = await this.repo.listOpenForReview(workspaceId, reviewId);
    return rows.slice(0, TRIAGE_BATCH_LIMIT).map(toTriagedFinding);
  }
}
