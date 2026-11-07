import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type SetupDeclaration = { declaration_id: string; entity_type: 'character' | 'location'; display_name: string; aliases?: string[] };
export type SetupSource = { text: string; declarations: SetupDeclaration[]; world_rules: {declaration_id: string; text: string}[];
  initial_conditions: {declaration_id: string; subject_declaration_id: string; attribute_key: string; value: string | number | boolean | null}[] };
export type SetupRequest = { contract_version: 'setup-v1'; novel_id: string; mode: 'extract' | 'blueprint'; idempotency_key: string;
  expected_setup_version: number; setup: SetupSource; hints?: {name: string; entity_type?: 'character' | 'location'}[];
  outline?: string; preferences?: {genre?: string[]; tone?: string; target_length?: string; pacing?: string};
  author_constraints?: string[]; private_author_notes?: string[]; locale?: string };
export type SetupCard = {proposal_id: string; dependency_group_id: string; card_type: 'entity' | 'world_rule' | 'initial_condition';
  status: 'pending' | 'accepted' | 'rejected'; origin: 'author_declared' | 'extracted_explicit' | 'model_proposed';
  source_kind: 'author_setup' | 'model_suggestion'; source_refs: Record<string, unknown>[]; payload: Record<string, unknown>;
  expected_brain_version: number};
export type SetupSnapshot = {contract_version: 'setup-v1'; novel_id: string; job_id: string; snapshot_id: string;
  setup_version: number; brain_version: number; review_version: number; setup_hash: string; text_hash: string;
  mode: 'extract' | 'blueprint'; job_status: string; snapshot: SetupSource; hints?: SetupRequest['hints'];
  outline?: string; preferences?: SetupRequest['preferences']; proposals: SetupCard[]};
export async function submitSetup(body: SetupRequest) {
  return (await apiClient.post<ApiEnvelope<{job_id: string; story_brain_id: string; status: string}>>('/ai/story-brains/bootstrap/from-idea', body)).data.data;
}
export async function getSetup(novelId: string, snapshotId?: string) {
  return (await apiClient.get<ApiEnvelope<SetupSnapshot>>(`/ai/story-brains/${novelId}/setup`, {params: {snapshot_id:snapshotId}})).data.data;
}
