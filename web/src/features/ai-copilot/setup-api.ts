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
  expected_brain_version: number; unresolved?: boolean; reviewed_payload?: Record<string, unknown>; decision_audit?: Record<string, unknown>};
export type SetupSnapshot = {contract_version: 'setup-v1'; novel_id: string; job_id: string; snapshot_id: string;
  setup_version: number; brain_version: number; review_version: number; setup_hash: string; text_hash: string;
  mode: 'extract' | 'blueprint'; job_status: string; snapshot: SetupSource; hints?: SetupRequest['hints'];
  outline?: string; preferences?: SetupRequest['preferences']; proposals: SetupCard[]; review?: {status: string; activation_available: false} | null; approved_identities?: {entity_id:string; canonical_name:string; entity_type:string}[]};
export async function submitSetup(body: SetupRequest, signal?:AbortSignal) {
  return (await apiClient.post<ApiEnvelope<{job_id: string; story_brain_id: string; status: string}>>('/ai/story-brains/bootstrap/from-idea', body, {signal})).data.data;
}
export async function getSetup(novelId: string, snapshotId?: string, signal?:AbortSignal) {
  return (await apiClient.get<ApiEnvelope<SetupSnapshot>>(`/ai/story-brains/${novelId}/setup`, {params: {snapshot_id:snapshotId},signal})).data.data;
}

export type SetupReviewDecision = {proposal_id:string; decision:'accept'|'reject'; reason?:string;
  identity?:{kind:'new'|'existing'; approved_entity_id?:string};
  edited_entity?:{canonical_name:string; aliases:string[]}; edited_rule?:{fact_key:string; fact_value:string; subject_entity_id?:string|null}};
export type SetupReviewRequest = {idempotency_key:string; dependency_group_id:string; setup_hash:string;
  expected_setup_version:number; expected_review_version:number; expected_brain_version:number; decisions:SetupReviewDecision[]};
export async function reviewSetup(novelId:string, snapshotId:string, body:SetupReviewRequest, signal?:AbortSignal) {
  return (await apiClient.post<ApiEnvelope<{status:string; review_version:number; brain_version:number}>>(
    `/ai/story-brains/${novelId}/setup/${snapshotId}/review`,body,{signal})).data.data;
}

export type SetupM0Readiness={contract_version:'setup-m0-v1';eligible:boolean;reason:string|null;
  setup_hash?:string;expected_setup_version?:number;expected_review_version?:number;expected_brain_version?:number;
  activation?:{status:'active';baseline_kind:'M0';brain_version:number};
  first_saved_revision?:{revision_id:string;chapter_id:string;content_hash:string;chapter_number:number}|null};
export async function getSetupM0Readiness(novelId:string,snapshotId:string,signal?:AbortSignal){
  return (await apiClient.get<ApiEnvelope<SetupM0Readiness>>(`/ai/story-brains/${novelId}/setup/${snapshotId}/activate`,{signal})).data.data;
}
export async function activateSetupM0(novelId:string,snapshotId:string,body:{contract_version:'setup-m0-v1';idempotency_key:string;setup_hash:string;expected_setup_version:number;expected_review_version:number;expected_brain_version:number},signal?:AbortSignal){
  return (await apiClient.post<ApiEnvelope<{status:'active';baseline_kind:'M0';brain_version:number}>>(`/ai/story-brains/${novelId}/setup/${snapshotId}/activate`,body,{signal})).data.data;
}
