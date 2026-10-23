import { assertActiveAccount } from '../../core/security/active-account.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import {
  countFollowers,
  findActiveAuthor,
  findPublishedNovel,
  followAuthor,
  likeNovel,
  unfollowAuthor,
  unlikeNovel
} from './social.repository.js';

export async function likePublishedNovel(auth: AuthContext, novelId: string) {
  const novel = await findPublishedNovel(novelId);

  if (!novel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  const likesCount = await likeNovel(auth.userId, novelId);
  if (likesCount === null) {
    throw new AppError(409, 'INTERACTION_001', 'Interaction already exists');
  }

  return {
    novelId,
    liked: true,
    likesCount
  };
}

export async function unlikePublishedNovel(auth: AuthContext, novelId: string) {
  const likesCount = await unlikeNovel(auth.userId, novelId);

  if (likesCount === null) {
    throw new AppError(404, 'INTERACTION_002', 'Interaction not found');
  }

  return {
    novelId,
    liked: false,
    likesCount
  };
}

export async function followPublishedAuthor(auth: AuthContext, authorId: string) {
  await assertActiveAccount(auth);
  const author = await findActiveAuthor(authorId);

  if (!author) {
    throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  }

  if (auth.userId === authorId) {
    throw new AppError(409, 'INTERACTION_001', 'Interaction already exists');
  }

  const inserted = await followAuthor(auth.userId, authorId);
  if (!inserted) {
    throw new AppError(409, 'INTERACTION_001', 'Interaction already exists');
  }

  return {
    authorId,
    following: true
  };
}

export async function unfollowPublishedAuthor(auth: AuthContext, authorId: string) {
  const deleted = await unfollowAuthor(auth.userId, authorId);

  if (!deleted) {
    throw new AppError(404, 'INTERACTION_002', 'Interaction not found');
  }

  return {
    authorId,
    following: false
  };
}

export async function getFollowerCount(authorId: string) {
  const author = await findActiveAuthor(authorId);

  if (!author) {
    throw new AppError(404, 'NOT_FOUND_001', 'Resource not found');
  }

  return {
    authorId,
    followersCount: await countFollowers(authorId)
  };
}
