import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { findChapterById } from '../novels/chapters.repository.js';
import { findNovelById } from '../novels/novels.repository.js';
import { listCopilotCharacters, listRecentCopilotTimelineEvents } from './ai-copilot.repository.js';
import type { CopilotSuggestionInput } from './ai-copilot.schemas.js';
import { aiUnavailable, generateCopilotSuggestionWithLlm, isLlmConfigured } from './llm-provider.js';

const recentWordLimit = 500;

async function assertCopilotAccess(auth: AuthContext, novelId: string, chapterId: string | null | undefined) {
  const novel = await findNovelById(novelId);

  if (!novel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  if (auth.role !== 'ADMIN' && novel.authorId !== auth.userId) {
    throw new AppError(403, 'CONTENT_005', 'Content ownership required');
  }

  if (chapterId) {
    const chapter = await findChapterById(chapterId);
    if (!chapter || chapter.novelId !== novelId) {
      throw new AppError(400, 'CONTENT_004', 'Chapter does not belong to this novel');
    }
  }

  return novel;
}

function takeLastWords(text: string, limit: number) {
  return text.trim().split(/\s+/).filter(Boolean).slice(-limit).join(' ');
}

export async function createCopilotSuggestion(auth: AuthContext, input: CopilotSuggestionInput) {
  await assertCopilotAccess(auth, input.novelId, input.chapterId);

  // SRS ai-intelligence-service §1 fallback: without an LLM the API answers AI_001 at once instead of a canned suggestion.
  if (!isLlmConfigured()) {
    throw aiUnavailable('not_configured');
  }

  const [characters, recentEvents] = await Promise.all([
    listCopilotCharacters(input.novelId),
    listRecentCopilotTimelineEvents(input.novelId, input.chapterId)
  ]);
  const recentText = takeLastWords(input.recentText, recentWordLimit);
  const provider = 'openai-compatible-ngrok';
  const suggestion = await generateCopilotSuggestionWithLlm({
    instruction: input.instruction,
    recentText,
    characters,
    recentEvents
  });

  return {
    suggestion,
    context: {
      characters,
      recentTimelineEvents: recentEvents,
      recentText,
      recentTextWordLimit: recentWordLimit,
      provider
    }
  };
}
