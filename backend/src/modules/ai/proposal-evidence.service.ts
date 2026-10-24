import { aiGatewayService } from './ai-gateway.service.js';
import { findRevisionById, findLatestRevisionByChapterId } from '../novels/chapter-revisions.repository.js';
import { AppError } from '../../core/errors/app-error.js';

export interface EvidenceProposal {
  proposal_id: string;
  dependency_group_id?: string;
  proposal_type?: string;
  evidence?: { revision_id?: string }[];
  payload?: { supersedes_id?: string; source_type?: string };
}

export function isHistoricalAuthorCorrection(selected: EvidenceProposal[]) {
  const root = selected.find(p => p.payload?.supersedes_id && p.payload.source_type === 'author');
  return Boolean(root && selected.every(p => p.dependency_group_id === root.dependency_group_id &&
    (p.proposal_id === root.proposal_id || p.proposal_type === 'state_transition')));
}

export async function assertCurrentProposalEvidence(novelId: string, ids: unknown, userId: string) {
  if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === 'string')) {
    throw new AppError(422, 'INVALID_PROPOSAL_IDS', 'Choose proposals to review');
  }
  const queue = await aiGatewayService.forwardRequest<EvidenceProposal[]>({ method: 'GET',
    path: `/v1/story-brains/${novelId}/review-queue`, userId });
  const selected = queue.filter(p => ids.includes(p.proposal_id));
  if (selected.length !== ids.length) throw new AppError(409, 'PROPOSAL_QUEUE_CHANGED', 'Reload the review queue');
  // An explicit author correction deliberately supersedes historical canon.
  // Its original evidence remains provenance; optimistic brain-version locking
  // governs the correction instead of requiring the old source to be the head.
  if (isHistoricalAuthorCorrection(selected)) return;
  for (const id of new Set(selected.flatMap(p => (p.evidence ?? []).map(e => e.revision_id).filter(Boolean)))) {
    const revision = await findRevisionById(undefined, id!);
    const head = revision && await findLatestRevisionByChapterId(undefined, revision.chapterId);
    if (!revision || revision.novelId !== novelId || head?.revisionId !== revision.revisionId) {
      throw new AppError(409, 'STALE_PROPOSAL_EVIDENCE', 'Source chapter changed. Reject outdated proposals and review the latest extraction.');
    }
  }
}
