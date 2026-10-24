type AuthorContext = { novelId: string; chapterId: string };
type ReadStorage = Pick<Storage, 'getItem'>;

const empty = (): AuthorContext => ({ novelId: '', chapterId: '' });
const key = (userId: string) => `ephurin_author_context:${userId}`;

/** Convenience context only. API ownership remains authoritative. Ignore unscoped legacy keys. */
export function readAuthorContext(userId: string, storage: ReadStorage = localStorage): AuthorContext {
  if (!userId) return empty();
  try {
    const value = JSON.parse(storage.getItem(key(userId)) ?? 'null');
    return value && typeof value.novelId === 'string' && typeof value.chapterId === 'string'
      ? { novelId: value.novelId, chapterId: value.chapterId } : empty();
  } catch { return empty(); }
}

export function writeAuthorContext(userId: string, context: AuthorContext, storage: Pick<Storage, 'setItem'> = localStorage) {
  if (!userId) return;
  try { storage.setItem(key(userId), JSON.stringify(context)); } catch { /* Storage is optional. */ }
}

export function resolveAuthorContext(userId: string, params: URLSearchParams, storage: ReadStorage = localStorage): AuthorContext {
  const saved = readAuthorContext(userId, storage), explicitNovel = params.get('novelId');
  return {
    novelId: explicitNovel ?? saved.novelId,
    chapterId: params.get('chapterId') ?? (explicitNovel === null || explicitNovel === saved.novelId ? saved.chapterId : '')
  };
}
