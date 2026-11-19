import { isContentAdmin } from '../../core/security/auth-context.js';
import { assertActiveAccount } from '../../core/security/active-account.js';
import { randomUUID } from 'node:crypto';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { slugify } from '../../core/utils/slug.js';
import { checkContent } from '../content-control/content-control.service.js';
import { NOVEL_SYNOPSIS_MIN, type CreateNovelInput, type ListNovelsInput, type UpdateNovelInput } from './novels.schemas.js';
import type { PoolClient } from 'pg';
import { assertNovelReadyForPublication } from './novel-publication-eligibility.js';
import {
  createNovel as createNovelRow,
  findNovelById,
  getNovelUnlockEarnings,
  listNovels as listNovelRows,
  listNovelsByAuthor,
  softDeleteNovel,
  submitNovelForPublish,
  updateNovel as updateNovelRow,
  upsertGenre
} from './novels.repository.js';

export { INITIAL_PUBLISH_MIN_CHAPTERS } from './novel-publication-eligibility.js';

function assertNovelOwner(novel: { authorId: string }, auth: AuthContext) {
  if (isContentAdmin(auth)) {
    return;
  }

  if (novel.authorId !== auth.userId) {
    throw new AppError(403, 'CONTENT_005', 'Content ownership required');
  }
}

// novels.slug is varchar(255); keep room for the 9-character suffix so a long title cannot overflow it.
const SLUG_BASE_MAX = 200;

function makeUniqueSlug(title: string) {
  const baseSlug = slugify(title).slice(0, SLUG_BASE_MAX).replace(/-+$/, '') || 'novel';
  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

export async function createNovel(auth: AuthContext, input: CreateNovelInput) {
  return withPostgresTransaction(async (client) => {
    const genreId = await upsertGenre(client, input.genres !== undefined ? input.genres[0] : input.genre);

    return createNovelRow(client, {
      ...input,
      authorId: auth.userId,
      slug: makeUniqueSlug(input.title),
      genreId
    });
  });
}

export async function listNovels(input: ListNovelsInput) {
  if (input.status && input.status !== 'PUBLISHED') throw new AppError(403, 'CONTENT_005', 'Use the authenticated author workspace to read drafts');
  const result = await listNovelRows(input);
  const totalPages = Math.ceil(result.totalItems / input.limit);

  return {
    data: result.items,
    meta: {
      page: input.page,
      limit: input.limit,
      totalItems: result.totalItems,
      totalPages
    }
  };
}

export async function listMyNovels(auth: AuthContext, input: ListNovelsInput) {
  const result = await listNovelsByAuthor(auth.userId, input);
  const totalPages = Math.ceil(result.totalItems / input.limit);

  return {
    data: result.items,
    meta: {
      page: input.page,
      limit: input.limit,
      totalItems: result.totalItems,
      totalPages
    }
  };
}

export async function getNovel(novelId: string) {
  const novel = await findNovelById(novelId);

  if (!novel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  return novel;
}

export async function getNovelEarnings(auth: AuthContext, novelId: string) {
  const novel = await getNovel(novelId);
  assertNovelOwner(novel, auth);
  return { unlockCoins: await getNovelUnlockEarnings(novelId) };
}

export async function updateNovel(auth: AuthContext, novelId: string, input: UpdateNovelInput) {
  const novel = await getNovel(novelId);
  assertNovelOwner(novel, auth);

  // D3: only a synopsis that actually changes must meet the minimum, so legacy novels with a short synopsis can
  // still update their cover or genres even when a client sends the unchanged synopsis back.
  if (input.synopsis !== undefined && input.synopsis !== (novel.synopsis ?? '').trim() && input.synopsis.length < NOVEL_SYNOPSIS_MIN) {
    throw new AppError(400, 'VALIDATION_001', `Giới thiệu cần tối thiểu ${NOVEL_SYNOPSIS_MIN} ký tự.`,
      { field: 'synopsis', minLength: NOVEL_SYNOPSIS_MIN, length: input.synopsis.length });
  }

  const updatedNovel = await updateNovelRow(novelId, input);
  if (!updatedNovel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  return updatedNovel;
}

export async function deleteNovel(auth: AuthContext, novelId: string) {
  const novel = await getNovel(novelId);
  assertNovelOwner(novel, auth);
  await softDeleteNovel(novelId);
}

export async function submitPublish(auth: AuthContext, novelId: string) {
  return withPostgresTransaction(client => submitPublishLocked(auth, novelId, client));
}

async function submitPublishLocked(auth: AuthContext, novelId: string, client: PoolClient) {
  await client.query('select novel_id from novels where novel_id = $1 for update', [novelId]);
  const novel = await findNovelById(novelId, client);
  if (!novel) throw new AppError(404, 'CONTENT_001', 'Content not found');
  assertNovelOwner(novel, auth);

  if (!['DRAFT', 'REJECTED', 'PENDING_MODERATION'].includes(novel.status)) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  await assertNovelReadyForPublication(client, novelId);

  const moderation = await checkContent({
    targetType: 'NOVEL',
    targetId: novel.novelId,
    content: `${novel.title}\n\n${novel.synopsis}`,
    submittedBy: auth.userId,
    publicationRequest: true,
    publicationSnapshot: { title: novel.title, content: novel.synopsis }
  }, client);

  const updatedNovel = novel.status === 'PENDING_MODERATION' ? novel : await submitNovelForPublish(novelId, client);
  if (!updatedNovel) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  return {
    novelId: updatedNovel.novelId,
    status: updatedNovel.status,
    moderationRequired: true,
    moderationReviewId: moderation.moderationReviewId
  };
}

export async function readNovel(novelId: string, auth?: AuthContext) {
  const novel = await getNovel(novelId);
  const owner = auth && (auth.userId === novel.authorId || isContentAdmin(auth));
  if (owner) await assertActiveAccount(auth);
  else if (novel.status !== 'PUBLISHED') throw new AppError(404, 'CONTENT_001', 'Content not found');
  return novel;
}
