import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const listMock = vi.fn();
const createMock = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    baseURL: string;
    apiKey: string;
    models = { list: listMock };
    chat = { completions: { create: createMock } };
    constructor(opts: { apiKey: string; baseURL: string }) {
      this.apiKey = opts.apiKey;
      this.baseURL = opts.baseURL;
    }
  },
}));

const { LocalOpenAICompatibleProvider, OLLAMA_DEFAULT_BASE_URL, LMSTUDIO_DEFAULT_BASE_URL } =
  await import('../src/adapters/llm/local-openai-compatible.js');

describe('LocalOpenAICompatibleProvider', () => {
  beforeEach(() => {
    listMock.mockReset();
    createMock.mockReset();
  });

  it('exposes the expected localhost defaults for Ollama and LM Studio', () => {
    expect(OLLAMA_DEFAULT_BASE_URL).toBe('http://localhost:11434/v1');
    expect(LMSTUDIO_DEFAULT_BASE_URL).toBe('http://localhost:1234/v1');
  });

  it('listModels maps the SDK response and tags each model with the provider id', async () => {
    listMock.mockResolvedValue({ data: [{ id: 'llama3.2', created: 123 }] });
    const provider = new LocalOpenAICompatibleProvider({ id: 'ollama', baseURL: OLLAMA_DEFAULT_BASE_URL });

    const models = await provider.listModels();

    expect(models).toEqual([{ id: 'llama3.2', provider: 'ollama', created: 123 }]);
  });

  it('listModels propagates a fetch failure so the caller can degrade (e.g. to [])', async () => {
    listMock.mockRejectedValue(new Error('fetch failed'));
    const provider = new LocalOpenAICompatibleProvider({ id: 'lmstudio', baseURL: LMSTUDIO_DEFAULT_BASE_URL });

    await expect(provider.listModels()).rejects.toThrow('fetch failed');
  });

  it('completeStructured always reports costUsd: 0 — local inference is free', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const provider = new LocalOpenAICompatibleProvider({ id: 'ollama', baseURL: OLLAMA_DEFAULT_BASE_URL });

    const result = await provider.completeStructured({
      model: 'llama3.2',
      schema: z.object({ ok: z.boolean() }),
      schemaName: 'Ok',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.costUsd).toBe(0);
  });

  it('embed is not supported', async () => {
    const provider = new LocalOpenAICompatibleProvider({ id: 'ollama', baseURL: OLLAMA_DEFAULT_BASE_URL });
    await expect(provider.embed()).rejects.toThrow(/does not support embeddings/);
  });
});
