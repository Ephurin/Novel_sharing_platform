import { apiClient, type ApiEnvelope } from '../../shared/api/api-client';

export type BootstrapRevisionInput = {
  chapter_id: string;
  revision_id: string;
  content_hash: string;
};

export type BootstrapJob = {
  job_id: string;
  novel_id: string;
  status: 'queued' | 'running' | 'waiting_review' | 'completed' | 'failed';
  stage: string;
  progress: { current: number; total: number; unit: string; stage: string };
  result: { proposal_count?: number; required_proposal_ids?: string[] } | null;
  error: { message?: string } | null;
};

export type ReviewProposal = {
  proposal_id: string;
  proposal_type: string;
  dependency_group_id: string;
  payload: Record<string, unknown>;
  confidence: number | null;
  review_priority: number;
  review_reason: string;
};

export type StoryBrainSummary = {
  id: string;
  novel_id: string;
  status: string;
  brain_version: number;
  baseline_revision_id: string | null;
  counts: { entities: number; events: number; pending_proposals: number; open_findings: number };
};

export async function startManuscriptBootstrap(novelId: string, revisions: BootstrapRevisionInput[]) {
  const response = await apiClient.post<ApiEnvelope<{ job_id: string; story_brain_id: string; status: string }>>(
    '/ai/story-brains/bootstrap/from-manuscript',
    {
      novel_id: novelId,
      revisions,
      locale: 'vi-VN',
      options: { extract_world_rules: true, build_embeddings: false, require_review_for_all: true }
    }
  );
  return response.data.data;
}

export async function getBootstrapJob(jobId: string) {
  const response = await apiClient.get<ApiEnvelope<BootstrapJob>>(`/ai/jobs/${jobId}`);
  return response.data.data;
}

export async function getReviewQueue(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<ReviewProposal[]>>(`/ai/story-brains/${novelId}/review-queue`);
  return response.data.data;
}

export async function getStoryBrainSummary(novelId: string) {
  const response = await apiClient.get<ApiEnvelope<StoryBrainSummary>>(`/ai/story-brains/by-novel/${novelId}`);
  return response.data.data;
}

export async function acceptProposalGroup(groupId: string, proposalIds: string[], version: number) {
  const response = await apiClient.post<ApiEnvelope<{ brain_version: number }>>(
    `/ai/proposal-groups/${groupId}/accept`,
    {
      proposal_ids: proposalIds,
      expected_brain_version: version,
      reason: 'Reviewed during manuscript import'
    }
  );
  return response.data.data;
}

export async function rejectProposal(proposalId: string) {
  await apiClient.post(`/ai/proposals/${proposalId}/reject`, {
    reason: 'Rejected during manuscript import'
  });
}

export async function activateBaseline(novelId: string, jobId: string) {
  const response = await apiClient.post<ApiEnvelope<StoryBrainSummary>>(
    `/ai/story-brains/${novelId}/baseline/activate`,
    {
      job_id: jobId
    }
  );
  return response.data.data;
}
