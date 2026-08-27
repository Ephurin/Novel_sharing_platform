import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type CopilotCharacterContext = {
  characterId: string;
  name: string;
  role: string;
  personality: string | null;
  description: string | null;
  notes: string | null;
};

export type CopilotTimelineEventContext = {
  eventId: string;
  chapterId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  title: string;
  eventOrder: number;
  summary: string;
};

export type CopilotSuggestionResponse = {
  suggestion: string;
  context: {
    characters: CopilotCharacterContext[];
    recentTimelineEvents: CopilotTimelineEventContext[];
    recentText: string;
    recentTextWordLimit: number;
    provider: string;
  };
};

export async function createCopilotSuggestion(input: {
  novelId: string;
  chapterId?: string | null;
  instruction: string;
  recentText: string;
}) {
  const response = await apiClient.post<ApiEnvelope<CopilotSuggestionResponse>>('/ai/copilot/suggestions', input);
  return response.data.data;
}
