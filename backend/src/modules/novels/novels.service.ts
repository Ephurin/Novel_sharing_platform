import { randomUUID } from 'node:crypto';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { slugify } from '../../core/utils/slug.js';
import type { CreateNovelInput, ListNovelsInput, UpdateNovelInput } from './novels.schemas.js';
import {
  createNovel as createNovelRow,
  findNovelById,
  listNovels as listNovelRows,
  softDeleteNovel,
  submitNovelForPublish,
  updateNovel as updateNovelRow,
  upsertGenre
} from './novels.repository.js';

function assertNovelOwner(novel: { authorId: string }, auth: AuthContext) {
  if (auth.role === 'ADMIN') {
    return;
  }

  if (novel.authorId !== auth.userId) {
    throw new AppError(403, 'CONTENT_005', 'Content ownership required');
  }
}

function makeUniqueSlug(title: string) {
  const baseSlug = slugify(title) || 'novel';
  return `${baseSlug}-${randomUUID().slice(0, 8)}`;
}

export async function createNovel(auth: AuthContext, input: CreateNovelInput) {
  return withPostgresTransaction(async (client) => {
    const genreId = await upsertGenre(client, input.genre);

    return createNovelRow(client, {
      ...input,
      authorId: auth.userId,
      slug: makeUniqueSlug(input.title),
      genreId
    });
  });
}

export async function listNovels(input: ListNovelsInput) {
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

export async function getNovel(novelId: string) {
  const novel = await findNovelById(novelId);

  if (!novel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  return novel;
}

export async function updateNovel(auth: AuthContext, novelId: string, input: UpdateNovelInput) {
  const novel = await getNovel(novelId);
  assertNovelOwner(novel, auth);

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
  const novel = await getNovel(novelId);
  assertNovelOwner(novel, auth);

  const updatedNovel = await submitNovelForPublish(novelId);
  if (!updatedNovel) {
    throw new AppError(409, 'CONTENT_004', 'Invalid content state');
  }

  return {
    novelId: updatedNovel.novelId,
    status: updatedNovel.status,
    moderationRequired: true
  };
}
