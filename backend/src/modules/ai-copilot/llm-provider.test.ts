import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../../core/config/env.js';
import { checkLlmProviderHealth } from './llm-provider.js';

describe('AI Copilot LLM Provider Health Check', () => {
  const originalBaseUrl = env.AI_LLM_BASE_URL;
  const originalModel = env.AI_LLM_MODEL;

  beforeEach(() => {
    (env as any).AI_LLM_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
    (env as any).AI_LLM_MODEL = 'gemini-3.5-flash-lite';
  });

  afterEach(() => {
    (env as any).AI_LLM_BASE_URL = originalBaseUrl;
    (env as any).AI_LLM_MODEL = originalModel;
  });

  test('recognizes models with models/ prefix from Google OpenAI endpoint', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [
            { id: 'models/gemini-2.5-flash' },
            { id: 'models/gemini-3.5-flash-lite' },
            { id: 'models/gemini-3.1-flash-lite' }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const result = await checkLlmProviderHealth();
      assert.equal(result.ready, true);
      assert.match(result.message, /available/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('recognizes models without prefix from standard OpenAI endpoint', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [
            { id: 'gemini-3.5-flash-lite' },
            { id: 'gpt-4o' }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const result = await checkLlmProviderHealth();
      assert.equal(result.ready, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('reports ready=false when configured model is absent', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          data: [
            { id: 'models/some-other-model' }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const result = await checkLlmProviderHealth();
      assert.equal(result.ready, false);
      assert.match(result.message, /not listed/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
