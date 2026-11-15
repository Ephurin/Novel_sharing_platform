import type { RequestHandler } from 'express';
import { AppError } from '../../core/errors/app-error.js';
import { successResponse } from '../../core/response/response.js';
import {
  createCharacter,
  createRelationship,
  createStoryPlotSummary,
  createStoryTimelineEvent,
  deleteCharacter,
  deleteRelationship,
  deleteStoryPlotSummary,
  deleteStoryTimelineEvent,
  listCharacters,
  listPlotSummaries,
  listRelationships,
  listTimelineEvents,
  syncStoryBible,
  updateCharacter,
  updateRelationship,
  updateStoryPlotSummary,
  updateStoryTimelineEvent
} from './story-context.service.js';

function requireRequestAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) {
    throw new AppError(401, 'AUTH_002', 'Missing access token');
  }

  return request.auth;
}

export const syncStoryBibleController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await syncStoryBible(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) { next(error); }
};

export const listCharactersController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await listCharacters(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const createCharacterController: RequestHandler = async (request, response, next) => {
  try {
    const result = await createCharacter(requireRequestAuth(request), String(request.params.novelId), request.body);
    response.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const updateCharacterController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateCharacter(requireRequestAuth(request), String(request.params.characterId), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const deleteCharacterController: RequestHandler = async (request, response, next) => {
  try {
    await deleteCharacter(requireRequestAuth(request), String(request.params.characterId));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const listRelationshipsController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await listRelationships(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const createRelationshipController: RequestHandler = async (request, response, next) => {
  try {
    const result = await createRelationship(requireRequestAuth(request), String(request.params.novelId), request.body);
    response.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const updateRelationshipController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateRelationship(requireRequestAuth(request), String(request.params.relationshipId), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const deleteRelationshipController: RequestHandler = async (request, response, next) => {
  try {
    await deleteRelationship(requireRequestAuth(request), String(request.params.relationshipId));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const listTimelineEventsController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await listTimelineEvents(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const createTimelineEventController: RequestHandler = async (request, response, next) => {
  try {
    const result = await createStoryTimelineEvent(requireRequestAuth(request), String(request.params.novelId), request.body);
    response.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const updateTimelineEventController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateStoryTimelineEvent(requireRequestAuth(request), String(request.params.eventId), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const deleteTimelineEventController: RequestHandler = async (request, response, next) => {
  try {
    await deleteStoryTimelineEvent(requireRequestAuth(request), String(request.params.eventId));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const listPlotSummariesController: RequestHandler = async (request, response, next) => {
  try {
    response.json(successResponse(await listPlotSummaries(requireRequestAuth(request), String(request.params.novelId))));
  } catch (error) {
    next(error);
  }
};

export const createPlotSummaryController: RequestHandler = async (request, response, next) => {
  try {
    const result = await createStoryPlotSummary(requireRequestAuth(request), String(request.params.novelId), request.body);
    response.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const updatePlotSummaryController: RequestHandler = async (request, response, next) => {
  try {
    const result = await updateStoryPlotSummary(requireRequestAuth(request), String(request.params.summaryId), request.body);
    response.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const deletePlotSummaryController: RequestHandler = async (request, response, next) => {
  try {
    await deleteStoryPlotSummary(requireRequestAuth(request), String(request.params.summaryId));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
};
