import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export interface MemoryEntity { entity_id: string; name: string; entity_type: string; status: string; location: string }
export interface MemoryEvent { event_id: string; summary: string; event_type: string; participants: string[]; chapter: number; metadata: { supersedes_id?: string; is_retired?: boolean } }
export interface ApprovedMemory { entities: MemoryEntity[]; events: MemoryEvent[]; facts: Record<string, unknown>[]; metadata: { brain_version?: string };
  transitions: { event_id?: string; entity_id: string; attribute_key: string; new_value: unknown }[] }
export interface FutureEvent { title: string; description: string; target_chapter: number; min_words: number; ending: boolean }
export interface AuthorPlan { plan_id: string; objectives: { objective_id: string; title: string; description: string; target_chapter: number; status: string; objective_type: string; metadata: { min_words?: number; is_terminal?: boolean } }[] }
export interface AutoRun { run_id: string; status: string; stop_reason: string | null; current_iteration: number }
export interface ConsistencyFinding { description: string; evidence: string; revision_id: string }

export async function memoryGet<T>(path: string): Promise<T> {
  return (await apiClient.get<ApiEnvelope<T>>(path)).data.data;
}
export async function memoryPost<T>(path: string, body: unknown): Promise<T> {
  return (await apiClient.post<ApiEnvelope<T>>(path, body)).data.data;
}
export const getApprovedMemory = (novelId: string) => memoryGet<ApprovedMemory>(`/ai/story-brains/${novelId}/memory`);
export const runAuthorOperation = <T,>(novelId: string, body: unknown) => memoryPost<T>(`/ai/story-brains/${novelId}/author-operation`, body);

export async function saveFuturePlan(novelId: string, events: FutureEvent[], direction: string) {
  const plan = await memoryPost<AuthorPlan>('/ai/story-plans', { novel_id: novelId, source_outline: direction,
    objectives: events.map((e, i) => ({ order_index: i + 1, title: e.title, description: e.description,
      target_chapter: e.target_chapter, objective_type: e.ending ? 'ending' : 'chapter_goal',
      metadata: { min_words: e.min_words, is_terminal: e.ending } })) });
  return memoryPost<AuthorPlan>(`/ai/story-plans/${plan.plan_id}/activate?novel_id=${novelId}`, {});
}
