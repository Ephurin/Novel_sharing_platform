import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../../core/config/env.js';
import {
  checkLlmProviderHealth,
  generateCopilotSuggestionWithLlm,
  sanitizeCopilotCharactersForPrompt
} from './llm-provider.js';

describe('AI Copilot LLM Provider Health Check & Privacy Guard', () => {
  const originalBaseUrl = env.AI_LLM_BASE_URL;
  const originalModel = env.AI_LLM_MODEL;
  const originalGuardUrl = process.env.BUDGET_GUARD_URL;
  const originalGuardMode = process.env.BUDGET_GUARD_MODE;
  const originalGuardToken = process.env.BUDGET_GUARD_AUTH_TOKEN;

  beforeEach(() => {
    (env as any).AI_LLM_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
    (env as any).AI_LLM_MODEL = 'gemini-3.5-flash-lite';
    delete process.env.BUDGET_GUARD_URL;
    delete process.env.BUDGET_GUARD_MODE;
    delete process.env.BUDGET_GUARD_AUTH_TOKEN;
  });

  afterEach(() => {
    (env as any).AI_LLM_BASE_URL = originalBaseUrl;
    (env as any).AI_LLM_MODEL = originalModel;
    if (originalGuardUrl === undefined) delete process.env.BUDGET_GUARD_URL;
    else process.env.BUDGET_GUARD_URL = originalGuardUrl;
    if (originalGuardMode === undefined) delete process.env.BUDGET_GUARD_MODE;
    else process.env.BUDGET_GUARD_MODE = originalGuardMode;
    if (originalGuardToken === undefined) delete process.env.BUDGET_GUARD_AUTH_TOKEN;
    else process.env.BUDGET_GUARD_AUTH_TOKEN = originalGuardToken;
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

  test('deterministic privacy canary: strips character notes and private author notes from outbound prompt', async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody = '';
    globalThis.fetch = (async (_input, init) => {
      capturedBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: 'Lâm Phong tiếp bước.' }
            }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }) as typeof fetch;

    try {
      const rawCharactersWithCanary = [
        {
          characterId: 'char-001',
          name: 'Lâm Phong',
          role: 'PROTAGONIST',
          personality: 'Trầm tĩnh, cẩn trọng',
          description: 'Thiếu niên mang huyết mạch bí ẩn',
          notes: 'CANARY_PRIVATE_NOTE_7742_CUU_U_MA_TON',
          author_notes: 'CANARY_AUTHOR_NOTES_8811',
          private_author_notes: 'CANARY_PRIVATE_AUTHOR_NOTES_9922'
        }
      ];

      const cleaned = sanitizeCopilotCharactersForPrompt(rawCharactersWithCanary);
      assert.deepEqual(cleaned, [
        {
          name: 'Lâm Phong',
          role: 'PROTAGONIST',
          personality: 'Trầm tĩnh, cẩn trọng',
          description: 'Thiếu niên mang huyết mạch bí ẩn'
        }
      ]);

      const suggestion = await generateCopilotSuggestionWithLlm({
        instruction: 'Viết tiếp cảnh cảng Cồn Vân',
        recentText: 'Mặt trời lặn sau rặng núi phía tây trấn Thanh Phong.',
        characters: rawCharactersWithCanary as any,
        recentEvents: [{ title: 'Khởi đầu', summary: 'Tại trấn Thanh Phong', chapterNumber: 1 }]
      });

      assert.equal(suggestion, 'Lâm Phong tiếp bước.');
      assert.ok(capturedBody.includes('Lâm Phong'), 'Expected public character name in prompt');
      assert.ok(capturedBody.includes('Trầm tĩnh, cẩn trọng'), 'Expected public personality in prompt');
      assert.ok(!capturedBody.includes('CANARY_PRIVATE_NOTE_7742_CUU_U_MA_TON'), 'Private notes leaked!');
      assert.ok(!capturedBody.includes('CANARY_AUTHOR_NOTES_8811'), 'author_notes leaked!');
      assert.ok(!capturedBody.includes('CANARY_PRIVATE_AUTHOR_NOTES_9922'), 'private_author_notes leaked!');
      assert.ok(!capturedBody.includes('"notes"'), 'notes key leaked into prompt JSON!');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('fails closed when BUDGET_GUARD_MODE=proxy has invalid or external URL', async () => {
    process.env.BUDGET_GUARD_MODE = 'proxy';
    process.env.BUDGET_GUARD_URL = 'https://generativelanguage.googleapis.com';
    process.env.BUDGET_GUARD_AUTH_TOKEN = 'backend-worker';

    await assert.rejects(
      () =>
        generateCopilotSuggestionWithLlm({
          instruction: 'Test',
          recentText: 'Text',
          characters: [],
          recentEvents: []
        }),
      (err: any) => err?.code === 'GUARD_CONFIGURATION_INVALID' && err?.httpStatus === 503
    );
  });
});
