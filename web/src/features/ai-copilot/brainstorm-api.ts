import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type BrainstormTarget = 'all' | 'world_rules' | 'characters' | 'future_events';

export type BrainstormParticipant = {
  entity_id?: string | null;
  name_hint?: string | null;
};

export type ProposedWorldRule = {
  rule_id: string;
  fact_key: string;
  text: string;
  category?: 'magic_system' | 'geography' | 'faction' | 'law' | 'cosmology' | 'general';
  origin: 'model_proposed';
  status: 'model_proposed';
  is_canon: false;
  is_historical: false;
};

export type ProposedCharacter = {
  character_id: string;
  name: string;
  canonical_name: string;
  entity_type: 'character';
  role: 'protagonist' | 'antagonist' | 'ally' | 'mentor' | 'bystander' | 'rival' | 'other';
  description: string;
  archetype?: string;
  aliases?: string[];
  origin: 'model_proposed';
  status: 'model_proposed';
  is_canon: false;
  is_historical: false;
};

export type ProposedFutureEvent = {
  event_id: string;
  target_chapter: number;
  title: string;
  description?: string;
  text?: string;
  ending?: boolean;
  min_words?: number;
  participants?: BrainstormParticipant[];
  origin: 'model_proposed';
  status: 'model_proposed';
  is_canon: false;
  is_historical: false;
};

export type BrainstormProvenance = {
  contract_version: 'brainstorm-v1';
  provider: string;
  model: string;
  status: 'model_proposed';
  grounding_rules_count: number;
  grounding_entities_count: number;
  timestamp: string;
};

export type BrainstormRequest = {
  contract_version: 'brainstorm-v1';
  target: BrainstormTarget;
  instruction?: string;
  current_chapter?: number;
  target_chapter?: number;
  idempotency_key?: string;
  expected_brain_version?: number;
  expected_plan_version?: number;
};

export type BrainstormResponse = {
  contract_version: 'brainstorm-v1';
  novel_id: string;
  story_brain_id: string;
  brain_version: number;
  plan_version?: number | null;
  world_rules: ProposedWorldRule[];
  characters: ProposedCharacter[];
  character_seeds?: ProposedCharacter[];
  future_events: ProposedFutureEvent[];
  events?: ProposedFutureEvent[];
  provenance: BrainstormProvenance;
};

export async function requestBrainstorm(
  novelId: string,
  req: BrainstormRequest,
  signal?: AbortSignal
): Promise<BrainstormResponse> {
  const headers: Record<string, string> = {};
  if (req.idempotency_key) {
    headers['Idempotency-Key'] = req.idempotency_key;
  }

  const response = await apiClient.post<ApiEnvelope<BrainstormResponse>>(
    `/ai/story-brains/${novelId}/brainstorm`,
    req,
    {
      signal,
      headers: Object.keys(headers).length ? headers : undefined,
    }
  );

  return response.data.data;
}

