import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';
import type {
  CharacterRole,
  CharacterProfile,
  CharacterRelationship,
  ContextSource,
  PlotSummary,
  PlotSummaryScope,
  StoryTimelineEvent
} from './story-context-types';

export type CreateCharacterPayload = {
  name: string;
  role: CharacterRole;
  personality?: string | null;
  description?: string | null;
  notes?: string | null;
  source?: ContextSource;
};

export type UpdateCharacterPayload = Partial<Omit<CreateCharacterPayload, 'source'>>;

export type CreateRelationshipPayload = {
  sourceCharacterId: string;
  targetCharacterId: string;
  relationshipType: string;
  description?: string | null;
};

export type UpdateRelationshipPayload = Partial<CreateRelationshipPayload>;

export type CreateTimelineEventPayload = {
  title: string;
  eventOrder: number;
  chapterId?: string | null;
  summary: string;
  source?: ContextSource;
};

export type UpdateTimelineEventPayload = Partial<Omit<CreateTimelineEventPayload, 'source'>>;

export type CreatePlotSummaryPayload = {
  scope: PlotSummaryScope;
  arcName?: string | null;
  chapterId?: string | null;
  startChapterNumber?: number | null;
  endChapterNumber?: number | null;
  summary: string;
  source?: ContextSource;
};

export type UpdatePlotSummaryPayload = Partial<Omit<CreatePlotSummaryPayload, 'source'>>;

export async function listCharacters(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<CharacterProfile[]>>(`/novels/${novelId}/characters`);
  return response.data.data;
}

export async function createCharacter(novelId: string, payload: CreateCharacterPayload) {
  const response = await apiClient.post<ApiEnvelope<CharacterProfile>>(`/novels/${novelId}/characters`, payload);
  return response.data.data;
}

export async function updateCharacter(characterId: string, payload: UpdateCharacterPayload) {
  const response = await apiClient.patch<ApiEnvelope<CharacterProfile>>(`/characters/${characterId}`, payload);
  return response.data.data;
}

export async function deleteCharacter(characterId: string) {
  await apiClient.delete(`/characters/${characterId}`);
}

export async function listCharacterRelationships(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<CharacterRelationship[]>>(
    `/novels/${novelId}/character-relationships`
  );
  return response.data.data;
}

export async function createCharacterRelationship(novelId: string, payload: CreateRelationshipPayload) {
  const response = await apiClient.post<ApiEnvelope<CharacterRelationship>>(
    `/novels/${novelId}/character-relationships`,
    payload
  );
  return response.data.data;
}

export async function updateCharacterRelationship(relationshipId: string, payload: UpdateRelationshipPayload) {
  const response = await apiClient.patch<ApiEnvelope<CharacterRelationship>>(
    `/character-relationships/${relationshipId}`,
    payload
  );
  return response.data.data;
}

export async function deleteCharacterRelationship(relationshipId: string) {
  await apiClient.delete(`/character-relationships/${relationshipId}`);
}

export async function listTimelineEvents(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<StoryTimelineEvent[]>>(`/novels/${novelId}/timeline-events`);
  return response.data.data;
}

export async function createTimelineEvent(novelId: string, payload: CreateTimelineEventPayload) {
  const response = await apiClient.post<ApiEnvelope<StoryTimelineEvent>>(`/novels/${novelId}/timeline-events`, payload);
  return response.data.data;
}

export async function updateTimelineEvent(eventId: string, payload: UpdateTimelineEventPayload) {
  const response = await apiClient.patch<ApiEnvelope<StoryTimelineEvent>>(`/timeline-events/${eventId}`, payload);
  return response.data.data;
}

export async function deleteTimelineEvent(eventId: string) {
  await apiClient.delete(`/timeline-events/${eventId}`);
}

export async function listPlotSummaries(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<PlotSummary[]>>(`/novels/${novelId}/plot-summaries`);
  return response.data.data;
}

export async function createPlotSummary(novelId: string, payload: CreatePlotSummaryPayload) {
  const response = await apiClient.post<ApiEnvelope<PlotSummary>>(`/novels/${novelId}/plot-summaries`, payload);
  return response.data.data;
}

export async function updatePlotSummary(summaryId: string, payload: UpdatePlotSummaryPayload) {
  const response = await apiClient.patch<ApiEnvelope<PlotSummary>>(`/plot-summaries/${summaryId}`, payload);
  return response.data.data;
}

export async function deletePlotSummary(summaryId: string) {
  await apiClient.delete(`/plot-summaries/${summaryId}`);
}
