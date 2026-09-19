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

// ──────────────────────────────────────────────
// Phase 6: Context Builder & Writing Loop API
// ──────────────────────────────────────────────

export type ContextPreviewData = {
  brain_version: number;
  entities: Array<{
    entity_id: string;
    name: string;
    entity_type: string;
    status: string;
    location: string;
    is_locked: boolean;
  }>;
  current_states: Array<{
    entity_id: string;
    name: string;
    status: string;
    location: string;
    state: Record<string, unknown>;
  }>;
  recent_events: Array<{
    event_id: string;
    chapter_number: number;
    event_type: string;
    summary: string;
    participants: string[];
  }>;
  world_rules: Array<{
    id?: string;
    statement?: string;
    description?: string;
    summary?: string;
    is_locked?: boolean;
  }>;
  token_budget: {
    used: number;
    maximum: number;
  };
};

export type WritingValidationResult = {
  validator: string;
  passed: boolean;
  code: string;
  message: string;
};

export type WritingPatch = {
  start: number;
  end: number;
  replacement: string;
};

export type WritingGenerationJob = {
  job_id: string;
  novel_id: string;
  chapter_id: string;
  revision_id: string;
  content_hash: string;
  operation: string;
  status: string;
  stage: string;
  draft?: string | null;
  patch?: WritingPatch | null;
  validation_status: 'pending' | 'passed' | 'failed';
  validations: WritingValidationResult[];
  context_summary: Record<string, string[]>;
  error?: { message: string } | null;
};

export type ChapterRevision = {
  revisionId: string;
  novelId: string;
  chapterId: string;
  parentRevisionId: string | null;
  contentHash: string;
  content: string;
  wordCount: number;
  sourceType: 'AUTHOR_MANUAL' | 'AI_DRAFT_ACCEPT' | 'BOOTSTRAP';
  sourceGenerationId: string | null;
  createdBy: string | null;
  createdAt: string;
};

export async function fetchContextPreview(
  storyBrainId: string,
  options?: { chapterNumber?: number; characterName?: string; tokenBudget?: number }
): Promise<ContextPreviewData> {
  const aiBase = import.meta.env.VITE_AI_SERVICE_BASE_URL ?? 'http://127.0.0.1:8000/v1';
  const tenantId = import.meta.env.VITE_AI_TENANT_ID ?? '00000000-0000-0000-0000-000000000001';

  const params = new URLSearchParams();
  if (options?.chapterNumber) params.append('chapter_number', String(options.chapterNumber));
  if (options?.characterName) params.append('character_name', options.characterName);
  if (options?.tokenBudget) params.append('token_budget', String(options.tokenBudget));

  const url = `${aiBase}/story-brains/${storyBrainId}/context-preview?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'X-Tenant-Id': tenantId,
      'X-Request-Id': crypto.randomUUID(),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch context preview: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}

export async function startWritingGeneration(input: {
  novelId: string;
  chapterId: string;
  revisionId: string;
  contentHash: string;
  operation: 'continue' | 'rewrite' | 'describe' | 'dialogue' | 'expand' | 'summarize';
  selection: { start?: number; end?: number; cursor: number };
  instruction: string;
  expectedBrainVersion?: number;
  idempotencyKey?: string;
}): Promise<WritingGenerationJob> {
  const aiBase = import.meta.env.VITE_AI_SERVICE_BASE_URL ?? 'http://127.0.0.1:8000/v1';
  const tenantId = import.meta.env.VITE_AI_TENANT_ID ?? '00000000-0000-0000-0000-000000000001';

  const res = await fetch(`${aiBase}/writing/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({
      novel_id: input.novelId,
      chapter_id: input.chapterId,
      revision_id: input.revisionId,
      content_hash: input.contentHash,
      operation: input.operation,
      selection: input.selection,
      instruction: input.instruction,
      expected_brain_version: input.expectedBrainVersion ?? 1,
      idempotency_key: input.idempotencyKey ?? '',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail?.message || err.detail?.code || `Generation request failed (${res.status})`);
  }
  const json = await res.json();
  return json.data;
}

export async function getJobStatus(jobId: string): Promise<WritingGenerationJob> {
  const aiBase = import.meta.env.VITE_AI_SERVICE_BASE_URL ?? 'http://127.0.0.1:8000/v1';
  const res = await fetch(`${aiBase}/jobs/${jobId}`, {
    headers: {
      'X-Request-Id': crypto.randomUUID(),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to get job: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}

export async function acceptDraftRevision(chapterId: string, generationId: string) {
  const response = await apiClient.post<ApiEnvelope<{ revision: ChapterRevision; chapterId: string }>>(
    `/chapters/${chapterId}/revisions/accept-draft`,
    { generationId }
  );
  return response.data.data;
}

export async function createChapterSnapshot(chapterId: string, content?: string) {
  const response = await apiClient.post<ApiEnvelope<ChapterRevision>>(
    `/chapters/${chapterId}/revisions/snapshot`,
    { content }
  );
  return response.data.data;
}

export async function listChapterRevisions(chapterId: string) {
  const response = await apiClient.get<ApiEnvelope<ChapterRevision[]>>(
    `/chapters/${chapterId}/revisions`
  );
  return response.data.data;
}

// Unicode code point conversion utilities
export function utf16OffsetToCodePoint(text: string, utf16Offset: number): number {
  return Array.from(text.slice(0, utf16Offset)).length;
}

export function codePointToUtf16Offset(text: string, codePointIndex: number): number {
  const codePoints = Array.from(text);
  return codePoints.slice(0, codePointIndex).join('').length;
}
