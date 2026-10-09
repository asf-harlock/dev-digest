import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { AlertsService } from '../alerts/service.js';
import { AlertRulesRepository } from './repository.js';
import { isReservedName, toAlertRuleDto, type AlertRuleDto } from './helpers.js';
import { RULE_PREVIEW_LIMIT } from './constants.js';

/**
 * Alert-rules service. Manages rules, previews what they would match and can
 * push a test alert through the alerts service.
 */
export class AlertRulesService {
  private readonly repo: AlertRulesRepository;
  private readonly alerts: AlertsService;

  constructor(private readonly container: Container) {
    this.repo = new AlertRulesRepository(container.db);
    this.alerts = new AlertsService(container);
  }

  async list(workspaceId: string) {
    return this.repo.listRules(workspaceId);
  }

  async create(workspaceId: string, userId: string, name: string, severity: string): Promise<AlertRuleDto> {
    if (isReservedName(name)) throw new ValidationError(`"${name}" is a reserved rule name`);
    try {
      const row = await this.repo.insertRule(workspaceId, userId, name, severity);
      return toAlertRuleDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('rule_exists', `A rule named "${name}" already exists`, 409);
      }
      throw err;
    }
  }

  async preview(workspaceId: string, ruleId: string) {
    const rule = await this.repo.getRule(workspaceId, ruleId);
    if (!rule) throw new NotFoundError('Rule not found');
    const hits = await this.repo.previewHits(rule.severity, RULE_PREVIEW_LIMIT);
    return { rule: toAlertRuleDto(rule), hits: hits.length };
  }

  async sendTest(req: FastifyRequest, workspaceId: string, ruleId: string) {
    const rule = await this.repo.getRule(workspaceId, ruleId);
    if (!rule) throw new NotFoundError('Rule not found');
    const token = this.loadSlackToken();
    req.log.info({ ruleId, hasToken: Boolean(token) }, 'sending test alert');
    return this.alerts.sendTest(workspaceId, rule.name);
  }

  private loadSlackToken(): string | undefined {
    const file = join(homedir(), '.devdigest', 'secrets.json');
    const secrets = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    return secrets.SLACK_TOKEN;
  }
}
