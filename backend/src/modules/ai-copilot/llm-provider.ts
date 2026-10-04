import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';

export type CopilotLlmContext = {
  instruction: string;
  recentText: string;
  characters: Array<{
    name: string;
    role: string;
    personality: string | null;
    description: string | null;
    notes?: string | null;
  }>;
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

export function isLlmConfigured() {
  return Boolean(env.AI_LLM_BASE_URL);
}

export async function checkLlmProviderHealth() {
  if (!env.AI_LLM_BASE_URL) {
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
    const response = await fetch(`${env.AI_LLM_BASE_URL.replace(/\/$/, '')}/models`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(env.AI_LLM_API_KEY ? { Authorization: `Bearer ${env.AI_LLM_API_KEY}` } : {})
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
  if (!env.AI_LLM_BASE_URL) {
    throw new AppError(500, 'AI_001', 'AI LLM base URL is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.AI_LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(env.AI_LLM_API_KEY ? { Authorization: `Bearer ${env.AI_LLM_API_KEY}` } : {})
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
                characters: context.characters,
                recentTimelineEvents: context.recentEvents,
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
