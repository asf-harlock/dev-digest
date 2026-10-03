import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from './openrouter.js';

function providerWith(create: ReturnType<typeof vi.fn>) {
  const p = new OpenRouterProvider('sk-test');
  (p as unknown as { client: { chat: { completions: { create: typeof create } } } }).client = {
    chat: { completions: { create } },
  };
  return p;
}

const ok = () => ({ choices: [{ message: { content: '{"a":1}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const req = { model: 'm', schema: z.object({ a: z.number() }), schemaName: 'A', messages: [{ role: 'user' as const, content: 'x' }] };

describe('OpenRouterProvider request timeout', () => {
  it("passes the caller's timeoutMs to the HTTP request, overriding the 90 s client default", async () => {
    const create = vi.fn().mockResolvedValue(ok());
    await providerWith(create).completeStructured({ ...req, timeoutMs: 180_000 });
    expect(create.mock.calls[0]![1]).toEqual({ timeout: 180_000 });
  });

  it('without timeoutMs, sends no request options (client default applies)', async () => {
    const create = vi.fn().mockResolvedValue(ok());
    await providerWith(create).completeStructured(req);
    expect(create.mock.calls[0]![1]).toBeUndefined();
  });
});
