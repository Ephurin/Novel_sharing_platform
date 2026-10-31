import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';

export type CopilotLlmCharacter = {
  name: string;
  role: string;
  personality: string | null;
  description: string | null;
};

export type CopilotLlmContext = {
  instruction: string;
  recentText: string;
  characters: CopilotLlmCharacter[];
  recentEvents: Array<{
    title: string;
    summary: string;
    chapterNumber: number | null;
  }>;
};

type ChatCompletionResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
};

type ModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

export function sanitizeCopilotCharactersForPrompt(
  characters: ReadonlyArray<Record<string, unknown>>
): CopilotLlmCharacter[] {
  return characters.map((character) => ({
    name: typeof character.name === 'string' ? character.name : '',
    role: typeof character.role === 'string' ? character.role : '',
    personality: typeof character.personality === 'string' ? character.personality : null,
    description: typeof character.description === 'string' ? character.description : null
  }));
}

function providerSettings() {
  const mode = (process.env.AI_EXECUTION_MODE || 'offline_test').toLowerCase().trim();
  const guard = process.env.BUDGET_GUARD_URL?.replace(/\/$/, '');
  const guardToken = process.env.BUDGET_GUARD_AUTH_TOKEN?.trim();

  if (mode === 'live_free_tier') {
    if (!guard || !guardToken || process.env.BUDGET_GUARD_MODE !== 'proxy') {
      throw new AppError(503, 'GUARD_CONFIGURATION_INVALID', 'Guard URL and auth token are required in live_free_tier mode');
    }
    let url: URL;
    try {
      url = new URL(guard);
    } catch {
      throw new AppError(503, 'GUARD_CONFIGURATION_INVALID', 'Guarded egress URL is malformed');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['budget-gateway', '127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/' ||
      url.search ||
      url.username
    ) {
      throw new AppError(503, 'GUARD_CONFIGURATION_INVALID', 'Guarded egress configuration is invalid');
    }
    return { baseUrl: `${guard}/v1`, key: guardToken };
  }

  if (!guard) {
    if (process.env.BUDGET_GUARD_MODE === 'proxy') {
      throw new AppError(503, 'GUARD_CONFIGURATION_INVALID', 'Guard URL is required');
    }
    return { baseUrl: env.AI_LLM_BASE_URL, key: env.AI_LLM_API_KEY };
  }
  let url: URL;
  try {
    url = new URL(guard);
  } catch {
    throw new AppError(503, 'GUARD_CONFIGURATION_INVALID', 'Guarded egress URL is malformed');
  }
  const key = process.env.BUDGET_GUARD_AUTH_TOKEN;
  if (
    process.env.BUDGET_GUARD_MODE !== 'proxy' ||
    !key ||
    url.protocol !== 'http:' ||
    !['budget-gateway', '127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/' ||
    url.search ||
    url.username
  ) {
    throw new AppError(503, 'GUARD_CONFIGURATION_INVALID', 'Guarded egress configuration is invalid');
  }
  return { baseUrl: `${guard}/v1`, key };
}

export function isLlmConfigured() {
  return Boolean(env.AI_LLM_BASE_URL || process.env.BUDGET_GUARD_URL);
}

export async function checkLlmProviderHealth() {
  const settings = providerSettings();
  if (!settings.baseUrl) {
    return {
      ready: false,
      provider: 'not-configured',
      baseUrl: null,
      configuredModel: env.AI_LLM_MODEL,
      models: [],
      message: 'AI_LLM_BASE_URL is not configured'
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(env.AI_LLM_TIMEOUT_MS, 15000));

  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/models`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(settings.key ? { Authorization: `Bearer ${settings.key}` } : {})
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      const message = errorText.includes('ERR_NGROK_3200') || errorText.includes('is offline')
        ? 'Ngrok endpoint is offline'
        : `Provider returned HTTP ${response.status}`;

      return {
        ready: false,
        provider: 'openai-compatible',
        baseUrl: env.AI_LLM_BASE_URL,
        configuredModel: env.AI_LLM_MODEL,
        models: [],
        message
      };
    }

    const payload = (await response.json()) as ModelsResponse;
    const models = payload.data?.map((model) => model.id).filter((model): model is string => Boolean(model)) ?? [];
    const isModelAvailable =
      models.includes(env.AI_LLM_MODEL) ||
      models.includes(`models/${env.AI_LLM_MODEL}`) ||
      models.some((id) => id.replace(/^models\//, '') === env.AI_LLM_MODEL.replace(/^models\//, ''));

    return {
      ready: isModelAvailable,
      provider: 'openai-compatible',
      baseUrl: env.AI_LLM_BASE_URL,
      configuredModel: env.AI_LLM_MODEL,
      models,
      message: isModelAvailable
        ? 'LLM provider is reachable and configured model is available'
        : 'LLM provider is reachable but configured model is not listed'
    };
  } catch (error) {
    return {
      ready: false,
      provider: 'openai-compatible',
      baseUrl: env.AI_LLM_BASE_URL,
      configuredModel: env.AI_LLM_MODEL,
      models: [],
      message: error instanceof Error ? error.message : 'LLM provider health check failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateCopilotSuggestionWithLlm(context: CopilotLlmContext) {
  const settings = providerSettings();
  if (!settings.baseUrl) {
    throw new AppError(500, 'AI_001', 'AI LLM base URL is not configured');
  }

  const sanitizedCharacters = sanitizeCopilotCharactersForPrompt(
    (context.characters ?? []) as unknown as ReadonlyArray<Record<string, unknown>>
  );
  const sanitizedEvents = (context.recentEvents ?? []).map((event) => ({
    title: event.title,
    summary: event.summary,
    chapterNumber: event.chapterNumber ?? null
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'X-Client-Service': 'backend-copilot',
        ...(settings.key ? { Authorization: `Bearer ${settings.key}` } : {})
      },
      body: JSON.stringify({
        model: env.AI_LLM_MODEL,
        temperature: env.AI_LLM_TEMPERATURE,
        max_tokens: env.AI_LLM_MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content:
              'You are an AI writing copilot for long-form fiction. Use only the provided story context. Preserve continuity, character traits, and timeline facts. Return helpful Vietnamese prose or guidance matching the user instruction.'
          },
          {
            role: 'user',
            content: JSON.stringify(
              {
                instruction: context.instruction,
                characters: sanitizedCharacters,
                recentTimelineEvents: sanitizedEvents,
                recentTextLast500Words: context.recentText
              },
              null,
              2
            )
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AppError(response.status, 'AI_002', 'AI provider request failed', errorText.slice(0, 1000));
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const choice = payload.choices?.[0];
    const content = choice?.message?.content?.trim();

    if (!content) {
      if (choice?.finish_reason === 'length') {
        throw new AppError(
          502,
          'AI_005',
          'AI provider used all completion tokens before returning final content. Increase AI_LLM_MAX_TOKENS or use a non-thinking model.'
        );
      }

      throw new AppError(502, 'AI_003', 'AI provider returned an empty response');
    }

    return content;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AppError(504, 'AI_004', 'AI provider request timed out');
    }

    throw new AppError(502, 'AI_002', 'AI provider request failed', error instanceof Error ? error.message : error);
  } finally {
    clearTimeout(timeout);
  }
}
