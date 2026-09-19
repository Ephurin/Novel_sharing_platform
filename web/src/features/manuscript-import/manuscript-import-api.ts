import axios from 'axios';

const aiClient = axios.create({
  baseURL: import.meta.env.VITE_AI_SERVICE_BASE_URL ?? 'http://127.0.0.1:8000/v1'
});

aiClient.interceptors.request.use((config) => {
  config.headers['X-Tenant-Id'] =
    import.meta.env.VITE_AI_TENANT_ID ?? '00000000-0000-0000-0000-000000000001';
  config.headers['X-Request-Id'] = crypto.randomUUID();
  return config;
});

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
  const response = await aiClient.post('/story-brains/bootstrap/from-manuscript', {
    novel_id: novelId,
    revisions,
    locale: 'vi-VN',
    options: { extract_world_rules: true, build_embeddings: false, require_review_for_all: true }
  });
  return response.data.data as { job_id: string; story_brain_id: string; status: string };
}

export async function getBootstrapJob(jobId: string) {
  const response = await aiClient.get(`/jobs/${jobId}`);
  return response.data.data as BootstrapJob;
}

export async function getReviewQueue(novelId: string) {
  const response = await aiClient.get(`/story-brains/${novelId}/review-queue`);
  return response.data.data as ReviewProposal[];
}

export async function getStoryBrainSummary(novelId: string) {
  const response = await aiClient.get(`/story-brains/by-novel/${novelId}`);
  return response.data.data as StoryBrainSummary;
}

export async function acceptProposalGroup(groupId: string, proposalIds: string[], version: number) {
  const response = await aiClient.post(`/proposal-groups/${groupId}/accept`, {
    proposal_ids: proposalIds,
    expected_brain_version: version,
    reason: 'Reviewed during manuscript import'
  });
  return response.data.data as { brain_version: number };
}

export async function rejectProposal(proposalId: string) {
  await aiClient.post(`/proposals/${proposalId}/reject`, {
    reason: 'Rejected during manuscript import'
  });
}

export async function activateBaseline(novelId: string, jobId: string) {
  const response = await aiClient.post(`/story-brains/${novelId}/baseline/activate`, {
    job_id: jobId
  });
  return response.data.data as StoryBrainSummary;
}
