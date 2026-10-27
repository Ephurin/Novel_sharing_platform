import type { EntityProfile, EntityProfileFields, EntityProfilePatch } from './author-memory-api';

export const PROFILE_FIELDS = ['description', 'appearance', 'personality', 'background'] as const;
export type ProfileDraft = EntityProfileFields & { author_notes: string; cutoff: string };
export const emptyProfileDraft = (): ProfileDraft => ({ description: '', appearance: '', personality: '', background: '', author_notes: '', cutoff: '' });
export const profileDraft = (profile: EntityProfile): ProfileDraft => ({ ...profile.profile, author_notes: profile.author_notes, cutoff: profile.effective_from_chapter?.toString() ?? '' });
export const codePointCount = (value: string) => Array.from(value).length;
export const canonicalChanged = (base: EntityProfile, draft: ProfileDraft) => PROFILE_FIELDS.some(key => base.profile[key] !== draft[key]);

/** Only changed allowlisted fields; no identity/state/provenance or plan mutation. */
export function buildProfilePatch(base: EntityProfile, draft: ProfileDraft): { patch?: EntityProfilePatch; error?: string } {
  for (const key of [...PROFILE_FIELDS, 'author_notes'] as const) {
    if (codePointCount(draft[key]) > (key === 'author_notes' ? 8000 : 4000)) {
      return { error: key === 'author_notes' ? 'Ghi chú tối đa 8.000 ký tự Unicode.' : 'Mỗi trường Canon tối đa 4.000 ký tự Unicode.' };
    }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(draft[key])) return { error: 'Không dùng ký tự điều khiển trong hồ sơ.' };
  }
  const canonical = canonicalChanged(base, draft);
  if (!canonical && draft.cutoff !== (base.effective_from_chapter?.toString() ?? '')) {
    return { error: 'Đổi chương hiệu lực cùng ít nhất một trường Canon, hoặc hoàn tác chương hiệu lực.' };
  }
  const patch: Partial<EntityProfileFields> & { expected_version: number; expected_brain_version: number; author_notes?: string; effective_from_chapter?: number } = { expected_version: base.version, expected_brain_version: base.brain_version };
  if (canonical) {
    const cutoff = Number(draft.cutoff);
    if (!/^\d+$/.test(draft.cutoff) || !Number.isInteger(cutoff) || cutoff < 1 || cutoff > 1000000) {
      return { error: 'Chương hiệu lực phải là số nguyên từ 1 đến 1.000.000.' };
    }
    patch.effective_from_chapter = cutoff;
    for (const key of PROFILE_FIELDS) if (draft[key] !== base.profile[key]) patch[key] = draft[key];
  }
  if (draft.author_notes !== base.author_notes) patch.author_notes = draft.author_notes;
  return Object.keys(patch).length > 2 ? { patch: patch as EntityProfilePatch } : {};
}
