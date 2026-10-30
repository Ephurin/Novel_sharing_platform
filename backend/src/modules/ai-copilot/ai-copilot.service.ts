import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { findChapterById } from '../novels/chapters.repository.js';
import { findNovelById } from '../novels/novels.repository.js';
import { listCopilotCharacters, listRecentCopilotTimelineEvents } from './ai-copilot.repository.js';
import type { CopilotSuggestionInput } from './ai-copilot.schemas.js';
import { generateCopilotSuggestionWithLlm, isLlmConfigured, sanitizeCopilotCharactersForPrompt } from './llm-provider.js';

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

function buildDraftSuggestion(input: {
  instruction: string;
  recentText: string;
  characters: Array<{ name: string; role: string; personality: string | null; description: string | null }>;
  recentEvents: Array<{ title: string; summary: string }>;
}) {
  const characterNames = input.characters
    .slice(0, 6)
    .map((character) => character.name)
    .join(', ');
  const latestEvent = input.recentEvents.at(-1);
  const recentEnding = input.recentText.split(/\s+/).filter(Boolean).slice(-40).join(' ');

  return [
    `Draft suggestion for: ${input.instruction}`,
    characterNames ? `Keep the scene grounded around: ${characterNames}.` : 'No character profiles are available yet, so keep characterization conservative.',
    latestEvent ? `Respect the latest timeline beat: ${latestEvent.title} — ${latestEvent.summary}` : 'No recent timeline events are available yet.',
    recentEnding ? `Continue from the current prose rhythm after: "${recentEnding}"` : 'No recent prose was provided, so start from the author direction.'
  ].join('\n\n');
}

export async function createCopilotSuggestion(auth: AuthContext, input: CopilotSuggestionInput) {
  await assertCopilotAccess(auth, input.novelId, input.chapterId);

  const [characters, recentEvents] = await Promise.all([
    listCopilotCharacters(input.novelId),
    listRecentCopilotTimelineEvents(input.novelId, input.chapterId)
  ]);
  const recentText = takeLastWords(input.recentText, recentWordLimit);
  const promptCharacters = sanitizeCopilotCharactersForPrompt(
    characters as unknown as ReadonlyArray<Record<string, unknown>>
  );
  const provider = isLlmConfigured() ? 'openai-compatible-ngrok' : 'typescript-direct-mock';
  const suggestion = isLlmConfigured()
    ? await generateCopilotSuggestionWithLlm({
        instruction: input.instruction,
        recentText,
        characters: promptCharacters,
        recentEvents
      })
    : buildDraftSuggestion({
        instruction: input.instruction,
        recentText,
        characters: promptCharacters,
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
