import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { findChapterById } from '../novels/chapters.repository.js';
import { findNovelById } from '../novels/novels.repository.js';
import {
  createCharacterProfile,
  createCharacterRelationship,
  createPlotSummary,
  createTimelineEvent,
  deleteCharacterRelationship,
  findCharacterById,
  findPlotSummaryById,
  findRelationshipById,
  findTimelineEventById,
  listCharactersByNovelId,
  listPlotSummariesByNovelId,
  listRelationshipsByNovelId,
  listTimelineEventsByNovelId,
  softDeleteCharacterProfile,
  softDeletePlotSummary,
  softDeleteTimelineEvent,
  updateCharacterProfile,
  updateCharacterRelationship,
  updatePlotSummary,
  updateTimelineEvent
} from './story-context.repository.js';
import type {
  CreateCharacterInput,
  CreatePlotSummaryInput,
  CreateRelationshipInput,
  CreateTimelineEventInput,
  UpdateCharacterInput,
  UpdatePlotSummaryInput,
  UpdateRelationshipInput,
  UpdateTimelineEventInput
} from './story-context.schemas.js';

async function assertNovelContextAccess(auth: AuthContext, novelId: string) {
  const novel = await findNovelById(novelId);

  if (!novel) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  if (auth.role !== 'ADMIN' && novel.authorId !== auth.userId) {
    throw new AppError(403, 'CONTENT_005', 'Content ownership required');
  }

  return novel;
}

async function assertChapterBelongsToNovel(chapterId: string | null | undefined, novelId: string) {
  if (!chapterId) return;

  const chapter = await findChapterById(chapterId);
  if (!chapter || chapter.novelId !== novelId) {
    throw new AppError(400, 'CONTENT_004', 'Chapter does not belong to this novel');
  }
}

async function assertCharacterBelongsToNovel(characterId: string, novelId: string) {
  const character = await findCharacterById(characterId);
  if (!character || character.novelId !== novelId) {
    throw new AppError(400, 'CONTENT_004', 'Character does not belong to this novel');
  }

  return character;
}

function validateRelationshipCharacters(input: { sourceCharacterId: string; targetCharacterId: string }) {
  if (input.sourceCharacterId === input.targetCharacterId) {
    throw new AppError(400, 'VALIDATION_001', 'Relationship requires two distinct characters');
  }
}

function validatePlotSummaryInput(input: {
  scope: 'NOVEL' | 'ARC' | 'CHAPTER';
  arcName?: string | null;
  chapterId?: string | null;
}) {
  if (input.scope === 'ARC' && !input.arcName) {
    throw new AppError(400, 'VALIDATION_001', 'Arc summary requires arcName');
  }

  if (input.scope === 'CHAPTER' && !input.chapterId) {
    throw new AppError(400, 'VALIDATION_001', 'Chapter summary requires chapterId');
  }
}

export async function listCharacters(auth: AuthContext, novelId: string) {
  await assertNovelContextAccess(auth, novelId);
  return listCharactersByNovelId(novelId);
}

export async function createCharacter(auth: AuthContext, novelId: string, input: CreateCharacterInput) {
  await assertNovelContextAccess(auth, novelId);
  return createCharacterProfile(novelId, auth.userId, input);
}

export async function updateCharacter(auth: AuthContext, characterId: string, input: UpdateCharacterInput) {
  const character = await findCharacterById(characterId);
  if (!character) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertNovelContextAccess(auth, character.novelId);
  return updateCharacterProfile(characterId, auth.userId, input);
}

export async function deleteCharacter(auth: AuthContext, characterId: string) {
  const character = await findCharacterById(characterId);
  if (!character) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertNovelContextAccess(auth, character.novelId);
  await softDeleteCharacterProfile(characterId, auth.userId);
}

export async function listRelationships(auth: AuthContext, novelId: string) {
  await assertNovelContextAccess(auth, novelId);
  return listRelationshipsByNovelId(novelId);
}

export async function createRelationship(auth: AuthContext, novelId: string, input: CreateRelationshipInput) {
  await assertNovelContextAccess(auth, novelId);
  validateRelationshipCharacters(input);
  await assertCharacterBelongsToNovel(input.sourceCharacterId, novelId);
  await assertCharacterBelongsToNovel(input.targetCharacterId, novelId);
  return createCharacterRelationship(novelId, input);
}

export async function updateRelationship(auth: AuthContext, relationshipId: string, input: UpdateRelationshipInput) {
  const relationship = await findRelationshipById(relationshipId);
  if (!relationship) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertNovelContextAccess(auth, relationship.novelId);
  const sourceCharacterId = input.sourceCharacterId ?? relationship.sourceCharacterId;
  const targetCharacterId = input.targetCharacterId ?? relationship.targetCharacterId;
  validateRelationshipCharacters({ sourceCharacterId, targetCharacterId });
  await assertCharacterBelongsToNovel(sourceCharacterId, relationship.novelId);
  await assertCharacterBelongsToNovel(targetCharacterId, relationship.novelId);
  return updateCharacterRelationship(relationshipId, input);
}

export async function deleteRelationship(auth: AuthContext, relationshipId: string) {
  const relationship = await findRelationshipById(relationshipId);
  if (!relationship) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertNovelContextAccess(auth, relationship.novelId);
  await deleteCharacterRelationship(relationshipId);
}

export async function listTimelineEvents(auth: AuthContext, novelId: string) {
  await assertNovelContextAccess(auth, novelId);
  return listTimelineEventsByNovelId(novelId);
}

export async function createStoryTimelineEvent(auth: AuthContext, novelId: string, input: CreateTimelineEventInput) {
  await assertNovelContextAccess(auth, novelId);
  await assertChapterBelongsToNovel(input.chapterId, novelId);
  return createTimelineEvent(novelId, auth.userId, input);
}

export async function updateStoryTimelineEvent(auth: AuthContext, eventId: string, input: UpdateTimelineEventInput) {
  const event = await findTimelineEventById(eventId);
  if (!event) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertNovelContextAccess(auth, event.novelId);
  await assertChapterBelongsToNovel(input.chapterId, event.novelId);
  return updateTimelineEvent(eventId, auth.userId, input);
}

export async function deleteStoryTimelineEvent(auth: AuthContext, eventId: string) {
  const event = await findTimelineEventById(eventId);
  if (!event) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertNovelContextAccess(auth, event.novelId);
  await softDeleteTimelineEvent(eventId, auth.userId);
}

export async function listPlotSummaries(auth: AuthContext, novelId: string) {
  await assertNovelContextAccess(auth, novelId);
  return listPlotSummariesByNovelId(novelId);
}

export async function createStoryPlotSummary(auth: AuthContext, novelId: string, input: CreatePlotSummaryInput) {
  await assertNovelContextAccess(auth, novelId);
  validatePlotSummaryInput(input);
  await assertChapterBelongsToNovel(input.chapterId, novelId);
  const existingSummaries = await listPlotSummariesByNovelId(novelId);
  const existingSummary = existingSummaries.find((summary) => {
    if (input.scope === 'NOVEL') return summary.scope === 'NOVEL';
    if (input.scope === 'ARC') return summary.scope === 'ARC' && summary.arcName === input.arcName;
    return summary.scope === 'CHAPTER' && summary.chapterId === input.chapterId;
  });

  if (existingSummary) {
    return updatePlotSummary(existingSummary.summaryId, auth.userId, {
      scope: input.scope,
      arcName: input.arcName,
      chapterId: input.chapterId,
      startChapterNumber: input.startChapterNumber,
      endChapterNumber: input.endChapterNumber,
      summary: input.summary
    });
  }

  return createPlotSummary(novelId, auth.userId, input);
}

export async function updateStoryPlotSummary(auth: AuthContext, summaryId: string, input: UpdatePlotSummaryInput) {
  const summary = await findPlotSummaryById(summaryId);
  if (!summary) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertNovelContextAccess(auth, summary.novelId);
  const nextScope = input.scope ?? summary.scope;
  const nextArcName = input.arcName === undefined ? summary.arcName : input.arcName;
  const nextChapterId = input.chapterId === undefined ? summary.chapterId : input.chapterId;
  validatePlotSummaryInput({ scope: nextScope, arcName: nextArcName, chapterId: nextChapterId });
  await assertChapterBelongsToNovel(nextChapterId, summary.novelId);
  return updatePlotSummary(summaryId, auth.userId, input);
}

export async function deleteStoryPlotSummary(auth: AuthContext, summaryId: string) {
  const summary = await findPlotSummaryById(summaryId);
  if (!summary) {
    throw new AppError(404, 'CONTENT_001', 'Content not found');
  }

  await assertNovelContextAccess(auth, summary.novelId);
  await softDeletePlotSummary(summaryId, auth.userId);
}
