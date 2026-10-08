export interface SlackMessage {
  channel: string;
  text: string;
}

/**
 * Slack incoming-webhook client. Thin: one POST, bounded by a timeout.
 */
export class SlackClient {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 5_000,
  ) {}

  async post(message: SlackMessage): Promise<void> {
    const res = await this.fetchImpl(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Slack responded ${res.status}`);
  }
}
