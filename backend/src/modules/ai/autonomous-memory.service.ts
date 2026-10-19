import type { EvidenceProposal } from './proposal-evidence.service.js';

interface MemoryDependencies {
  analysisStatus: () => Promise<string | null>;
  brainVersion: () => Promise<number>;
  proposals: () => Promise<EvidenceProposal[]>;
  assertCurrent: (ids: string[]) => Promise<void>;
  accept: (group: string, ids: string[], version: number) => Promise<number>;
}

// Kept separate from generation so a failed memory step can resume without writing again.
export async function approveAutonomousMemory(revisionId: string, deps: MemoryDependencies) {
  if (await deps.analysisStatus() !== 'COMPLETED') throw new Error('Analysis has not completed');
  let version = await deps.brainVersion();
  const relevant = (await deps.proposals()).filter(p => p.evidence?.some(e => e.revision_id === revisionId));
  for (const group of new Set(relevant.map(p => p.dependency_group_id))) {
    if (!group) throw new Error('Proposal is missing its dependency group');
    const ids = relevant.filter(p => p.dependency_group_id === group).map(p => p.proposal_id);
    await deps.assertCurrent(ids);
    version = await deps.accept(group, ids, version);
    if (!Number.isInteger(version) || version < 1) throw new Error('Invalid accepted brain version');
  }
  return version;
}

export async function objectiveIsComplete(content: string, minWords: number, terminal: boolean,
  evaluate: () => Promise<{ achieved: boolean; ending_resolved: boolean }>) {
  if (!Number.isFinite(minWords) || minWords < 1 || content.trim().split(/\s+/u).filter(Boolean).length < minWords) return false;
  const result = await evaluate();
  return result.achieved === true && (!terminal || result.ending_resolved === true);
}
