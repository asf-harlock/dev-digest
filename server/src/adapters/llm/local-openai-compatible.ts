import OpenAI from 'openai';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { toJsonSchema, parseWithRepair } from '../../platform/structured.js';
import { ExternalServiceError } from '../../platform/errors.js';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';
export const LMSTUDIO_DEFAULT_BASE_URL = 'http://localhost:1234/v1';

/** Local inference is slower than a cloud API — give it more room than the 60s cloud default. */
const DEFAULT_TIMEOUT = 120_000;
/** Neither server checks the key; the OpenAI SDK just requires a non-empty string. */
const PLACEHOLDER_API_KEY = 'local';

export interface LocalOpenAICompatibleProviderOptions {
  id: 'ollama' | 'lmstudio';
  baseURL: string;
  timeoutMs?: number;
}

/**
 * Ollama and LM Studio both expose an OpenAI-compatible `/v1` API and need no
 * API key — same shape as OpenRouterProvider (reviewer-core), but this one
 * lives in the server adapter ring (not reviewer-core) since a GitHub-hosted
 * CI runner can never reach a developer's localhost. Cost is always $0.
 */
export class LocalOpenAICompatibleProvider implements LLMProvider {
  readonly id: 'ollama' | 'lmstudio';
  private client: OpenAI;
  private timeoutMs: number;

  constructor(opts: LocalOpenAICompatibleProviderOptions) {
    this.id = opts.id;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
    this.client = new OpenAI({
      apiKey: PLACEHOLDER_API_KEY,
      baseURL: opts.baseURL,
      timeout: this.timeoutMs,
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    return withRetry(async () => {
      const res = await this.client.models.list();
      return res.data.map((m) => ({ id: m.id, provider: this.id, created: m.created }));
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return withRetry(() => withTimeout(this.doComplete(req), req.timeoutMs ?? this.timeoutMs));
  }

  private async doComplete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    });
    const text = res.choices?.[0]?.message?.content ?? '';
    return {
      text,
      model: req.model,
      tokensIn: res.usage?.prompt_tokens ?? 0,
      tokensOut: res.usage?.completion_tokens ?? 0,
      costUsd: 0,
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const maxRetries = req.maxRetries ?? 2;
    const messages = [...req.messages];
    let tokensIn = 0;
    let tokensOut = 0;
    let lastRaw = '';

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const res = await withRetry(() =>
        withTimeout(
          this.client.chat.completions.create({
            model: req.model,
            messages,
            temperature: req.temperature ?? 0,
            ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
            response_format: {
              type: 'json_schema',
              json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
            },
          }),
          req.timeoutMs ?? this.timeoutMs,
        ),
      );
      lastRaw = res.choices?.[0]?.message?.content ?? '';
      tokensIn += res.usage?.prompt_tokens ?? 0;
      tokensOut += res.usage?.completion_tokens ?? 0;

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: 0,
          raw: lastRaw,
          attempts: attempt,
        };
      }
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({ role: 'user', content: parsed.repromptMessage });
    }

    throw new ExternalServiceError(
      `${this.id} structured output failed schema validation`,
      { raw: lastRaw },
    );
  }

  async embed(): Promise<number[][]> {
    throw new ExternalServiceError(
      'LocalOpenAICompatibleProvider does not support embeddings.',
    );
  }
}
