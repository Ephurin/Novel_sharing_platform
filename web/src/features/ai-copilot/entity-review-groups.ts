import type { Decision, EntityReview, EntityType } from './author-memory-api';
import { entityTypeLabel } from './event-labels';

type Candidate = EntityReview['candidates'][number];

/** All occurrences of one surface (case-insensitive) in a checkpoint, in text order. */
export interface SurfaceGroup {
  key: string;
  surface: string;
  candidates: Candidate[];
}

/**
 * Long-run live test (2026-11-15): every mention was its own review item, 155-234 per chapter for
 * about 8-10 real entities. Above this many occurrences the review opens grouped by surface.
 */
export const GROUPED_VIEW_THRESHOLD = 30;

export const surfaceKey = (surface: string) => surface.normalize('NFC').toLocaleLowerCase('vi');

export function groupBySurface(candidates: Candidate[]): SurfaceGroup[] {
  const groups = new Map<string, SurfaceGroup>();
  for (const c of [...candidates].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const key = surfaceKey(c.surface);
    const group = groups.get(key);
    if (group) group.candidates.push(c);
    else groups.set(key, { key, surface: c.surface, candidates: [c] });
  }
  return Array.from(groups.values());
}

export const isResolved = (d?: Decision) => d?.verdict === 'entity' || d?.verdict === 'not_entity';

const identityOf = (d: Decision) =>
  d.verdict === 'entity' ? d.canonical_entity_id || d.provisional_identity_key : '';

/**
 * Occurrences a group action would change from one identity to another (or from an entity to
 * rejected). Two people can share a surface, so the author confirms before these are replaced.
 */
export function conflictingOccurrences(group: SurfaceGroup, choices: Record<string, Decision>,
                                       next: Decision): Candidate[] {
  return group.candidates.filter(c => {
    const existing = choices[c.candidate_id];
    if (!existing || existing.verdict !== 'entity') return false;
    return next.verdict !== 'entity' || identityOf(existing) !== identityOf(next);
  });
}

/** The group's decision for each occurrence; each keeps its own evidence quotes. */
export function applyToGroup(group: SurfaceGroup, choices: Record<string, Decision>,
                             machineFor: (candidateId: string) => Decision,
                             template: (machine: Decision) => Decision): Record<string, Decision> {
  return Object.fromEntries(group.candidates.map(c => {
    const existing = choices[c.candidate_id];
    const updated = template(machineFor(c.candidate_id));
    const keepQuotes = existing && updated.verdict === 'entity';
    return [c.candidate_id, keepQuotes ? {
      ...updated,
      identity_quote: updated.identity_quote || existing.identity_quote,
      status_quote: existing.status_quote
    } : updated];
  }));
}

export interface GroupSummary {
  resolved: number;
  /** The single decision shared by every occurrence, when there is one. */
  shared?: Decision;
  machine: Array<{ label: string; count: number }>;
  /** Most frequent machine entity type, for a new identity made from the group. */
  suggestedType: EntityType;
}

export function summarizeGroup(group: SurfaceGroup, choices: Record<string, Decision>,
                               machineFor: (candidateId: string) => Decision): GroupSummary {
  const decisions = group.candidates.map(c => choices[c.candidate_id]);
  const resolved = decisions.filter(isResolved).length;
  const first = decisions[0];
  const shared = first && resolved === decisions.length && decisions.every(d =>
    d!.verdict === first.verdict && identityOf(d!) === identityOf(first)) ? first : undefined;
  const machineCounts = new Map<string, number>();
  const types = new Map<EntityType, number>();
  for (const c of group.candidates) {
    const m = machineFor(c.candidate_id);
    // UI walkthrough (UI-5): the author reads "Tên riêng (Nhân vật)", not "entity [PER]".
    const label = m.verdict === 'entity' && m.entity_type ? `Tên riêng (${entityTypeLabel(m.entity_type)})`
      : m.verdict === 'not_entity' ? 'Không phải tên riêng' : 'Chưa chắc';
    machineCounts.set(label, (machineCounts.get(label) ?? 0) + 1);
    if (m.verdict === 'entity' && m.entity_type) types.set(m.entity_type, (types.get(m.entity_type) ?? 0) + 1);
  }
  const suggestedType = Array.from(types.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'PER';
  return {
    resolved,
    shared,
    machine: Array.from(machineCounts.entries()).map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    suggestedType
  };
}

const PERSON_HONORIFICS = new Set(['ông', 'bà', 'anh', 'chị', 'em', 'cô', 'chú', 'bác', 'cậu', 'dì', 'thím', 'mợ',
  'cụ', 'lão', 'thầy', 'ngài', 'nàng', 'chàng', 'bé', 'già', 'bạn', 'cháu', 'con', 'tiểu', 'đại']);

/** Same name, or the same name behind one honorific ("Chị Mai" / "Mai"): no alias evidence needed. */
export function needsAliasEvidence(surface: string, canonical: string): boolean {
  const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase('vi').trim();
  const bare = (s: string) => {
    const words = fold(s).split(/\s+/);
    return words.length > 1 && PERSON_HONORIFICS.has(words[0]) ? words.slice(1).join(' ') : words.join(' ');
  };
  return fold(surface) !== fold(canonical) && bare(surface) !== bare(canonical);
}

/**
 * Live retest 2 (R3): linking a short name ("Lôi Long") to a known entity ("Thượng cổ Lôi Long")
 * failed at Freeze because an alias needs an exact quote naming both. Find one sentence of this
 * occurrence's context that does, or null.
 */
export function aliasEvidence(context: string, surface: string, canonical: string): string | null {
  const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase('vi');
  for (const match of context.matchAll(/[^.!?…\n]+[.!?…]*/g)) {
    const sentence = match[0].trim();
    if (sentence.length >= 8 && fold(sentence).includes(fold(surface)) && fold(sentence).includes(fold(canonical))) {
      return sentence;
    }
  }
  return null;
}
