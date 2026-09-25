import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('defaults when no relevant env vars are set', () => {
    expect(loadConfig({})).toEqual({
      apiUrl: 'http://localhost:3001',
      runTimeoutMs: 55_000,
      pollIntervalMs: 2_000,
      enableBlastRadius: false,
    });
  });

  it('reads every var from the environment', () => {
    expect(
      loadConfig({
        DEVDIGEST_API_URL: 'http://localhost:4000',
        DEVDIGEST_MCP_RUN_TIMEOUT_MS: '10000',
        DEVDIGEST_MCP_POLL_INTERVAL_MS: '500',
        DEVDIGEST_MCP_ENABLE_BLAST_RADIUS: 'true',
      }),
    ).toEqual({
      apiUrl: 'http://localhost:4000',
      runTimeoutMs: 10_000,
      pollIntervalMs: 500,
      enableBlastRadius: true,
    });
  });

  it('only "true" (exact match) enables blast radius', () => {
    expect(loadConfig({ DEVDIGEST_MCP_ENABLE_BLAST_RADIUS: 'TRUE' }).enableBlastRadius).toBe(false);
    expect(loadConfig({ DEVDIGEST_MCP_ENABLE_BLAST_RADIUS: '1' }).enableBlastRadius).toBe(false);
    expect(loadConfig({ DEVDIGEST_MCP_ENABLE_BLAST_RADIUS: 'true' }).enableBlastRadius).toBe(true);
  });

  it('falls back to defaults on non-positive or non-numeric overrides', () => {
    expect(loadConfig({ DEVDIGEST_MCP_RUN_TIMEOUT_MS: 'nope' }).runTimeoutMs).toBe(55_000);
    expect(loadConfig({ DEVDIGEST_MCP_RUN_TIMEOUT_MS: '-5' }).runTimeoutMs).toBe(55_000);
    expect(loadConfig({ DEVDIGEST_MCP_RUN_TIMEOUT_MS: '0' }).runTimeoutMs).toBe(55_000);
  });

  it('falls back to the default API URL on an empty string', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: '' }).apiUrl).toBe('http://localhost:3001');
  });
});
