import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { logger } from '../../core/logger/logger.js';

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

// Provider responses are untrusted: they can echo prompts, request headers or keys. Keep a trimmed,
// masked copy for the server log only.
function maskUpstream(detail: unknown) {
  const text = typeof detail === 'string' ? detail : detail instanceof Error ? detail.message : JSON.stringify(detail) ?? '';
  return text
    .slice(0, 500)
    .replace(/(bearer\s+)[^\s"']+/gi, '$1[redacted]')
    .replace(/\b(sk|pk|key|token|secret)([-_][A-Za-z0-9._-]{4,})/gi, '$1-[redacted]');
}

// SRS appendix A / docs/API/error-codes.md: a timeout or an unavailable provider is AI_001 (503), so the
// client can drop the suggestion and let the author keep writing by hand. The client only ever gets the
// stable `reason`; whatever the provider said goes to the server log.
export function aiUnavailable(reason: string, message = 'AI tạm thời không khả dụng. Có thể tiếp tục viết thủ công hoặc thử lại sau.', upstream?: unknown) {
  if (upstream !== undefined) logger.warn({ reason, upstream: maskUpstream(upstream) }, 'AI provider unavailable');
  return new AppError(503, 'AI_001', message, { reason });
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
    throw aiUnavailable('not_configured');
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
      throw aiUnavailable(`provider_http_${response.status}`, undefined, errorText.slice(0, 1000));
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const choice = payload.choices?.[0];
    const content = choice?.message?.content?.trim();

    if (!content) {
      if (choice?.finish_reason === 'length') {
        throw aiUnavailable(
          'token_limit',
          'AI provider used all completion tokens before returning final content. Increase AI_LLM_MAX_TOKENS or use a non-thinking model.'
        );
      }

      throw aiUnavailable('empty_response');
    }

    return content;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw aiUnavailable('timeout');
    }

    throw aiUnavailable('unreachable', undefined, error instanceof Error ? error.message : error);
  } finally {
    clearTimeout(timeout);
  }
}
