import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { SlackClient } from '../../adapters/slack/client.js';
import { AlertsRepository } from './repository.js';
import { formatAlertText, resolveChannel, toAlertEventDto, type AlertEventDto } from './helpers.js';
import { ALERT_LOOKBACK_HOURS, ALERT_MAX_EVENTS, ONE_HOUR_MS } from './constants.js';

/**
 * Alerts service. Lists recent alert events and delivers them to Slack.
 */
export class AlertsService {
  private readonly repo: AlertsRepository;

  constructor(private readonly container: Container) {
    this.repo = new AlertsRepository(container.db);
  }

  async listRecent(workspaceId: string): Promise<AlertEventDto[]> {
    const since = new Date(Date.now() - ALERT_LOOKBACK_HOURS * ONE_HOUR_MS);
    const rows = await this.repo.listRecent(workspaceId, since, ALERT_MAX_EVENTS);
    return rows.map(toAlertEventDto);
  }

  async deliver(workspaceId: string, ruleId: string, severity: string, message: string) {
    const event = await this.repo.recordEvent(workspaceId, { ruleId, severity, message });
    const webhookUrl = process.env.ALERTS_SLACK_WEBHOOK;
    if (!webhookUrl) throw new NotFoundError('Slack webhook is not configured');
    const slack = new SlackClient(webhookUrl);
    await slack.post({
      channel: resolveChannel(this.container),
      text: formatAlertText(severity, message),
    });
    await this.repo.markDelivered(workspaceId, event.id, new Date());
    return toAlertEventDto({ ...event, deliveredAt: new Date() });
  }

  async sendTest(workspaceId: string, channel?: string) {
    return this.deliver(workspaceId, 'test', 'SUGGESTION', `Test alert for ${channel ?? 'default channel'}`);
  }
}
