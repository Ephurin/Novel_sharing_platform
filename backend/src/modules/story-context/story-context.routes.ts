import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import { validateRequest } from '../../core/validation/validate.js';
import {
  createCharacterController,
  createPlotSummaryController,
  createRelationshipController,
  createTimelineEventController,
  deleteCharacterController,
  deletePlotSummaryController,
  deleteRelationshipController,
  deleteTimelineEventController,
  listCharactersController,
  listPlotSummariesController,
  listRelationshipsController,
  listTimelineEventsController,
  updateCharacterController,
  updatePlotSummaryController,
  updateRelationshipController,
  updateTimelineEventController
} from './story-context.controller.js';
import {
  characterIdParamSchema,
  createCharacterSchema,
  createPlotSummarySchema,
  createRelationshipSchema,
  createTimelineEventSchema,
  novelIdParamSchema,
  plotSummaryIdParamSchema,
  relationshipIdParamSchema,
  timelineEventIdParamSchema,
  updateCharacterSchema,
  updatePlotSummarySchema,
  updateRelationshipSchema,
  updateTimelineEventSchema
} from './story-context.schemas.js';

export const storyContextRoutes = Router();

const requireAuthor = [requireAuth, requireRoles(['AUTHOR', 'ADMIN'])];

storyContextRoutes.get(
  '/novels/:novelId/characters',
  ...requireAuthor,
  validateRequest(novelIdParamSchema),
  listCharactersController
);
storyContextRoutes.post(
  '/novels/:novelId/characters',
  ...requireAuthor,
  validateRequest(createCharacterSchema),
  createCharacterController
);
storyContextRoutes.patch(
  '/characters/:characterId',
  ...requireAuthor,
  validateRequest(updateCharacterSchema),
  updateCharacterController
);
storyContextRoutes.delete(
  '/characters/:characterId',
  ...requireAuthor,
  validateRequest(characterIdParamSchema),
  deleteCharacterController
);

storyContextRoutes.get(
  '/novels/:novelId/character-relationships',
  ...requireAuthor,
  validateRequest(novelIdParamSchema),
  listRelationshipsController
);
storyContextRoutes.post(
  '/novels/:novelId/character-relationships',
  ...requireAuthor,
  validateRequest(createRelationshipSchema),
  createRelationshipController
);
storyContextRoutes.patch(
  '/character-relationships/:relationshipId',
  ...requireAuthor,
  validateRequest(updateRelationshipSchema),
  updateRelationshipController
);
storyContextRoutes.delete(
  '/character-relationships/:relationshipId',
  ...requireAuthor,
  validateRequest(relationshipIdParamSchema),
  deleteRelationshipController
);

storyContextRoutes.get(
  '/novels/:novelId/timeline-events',
  ...requireAuthor,
  validateRequest(novelIdParamSchema),
  listTimelineEventsController
);
storyContextRoutes.post(
  '/novels/:novelId/timeline-events',
  ...requireAuthor,
  validateRequest(createTimelineEventSchema),
  createTimelineEventController
);
storyContextRoutes.patch(
  '/timeline-events/:eventId',
  ...requireAuthor,
  validateRequest(updateTimelineEventSchema),
  updateTimelineEventController
);
storyContextRoutes.delete(
  '/timeline-events/:eventId',
  ...requireAuthor,
  validateRequest(timelineEventIdParamSchema),
  deleteTimelineEventController
);

storyContextRoutes.get(
  '/novels/:novelId/plot-summaries',
  ...requireAuthor,
  validateRequest(novelIdParamSchema),
  listPlotSummariesController
);
storyContextRoutes.post(
  '/novels/:novelId/plot-summaries',
  ...requireAuthor,
  validateRequest(createPlotSummarySchema),
  createPlotSummaryController
);
storyContextRoutes.patch(
  '/plot-summaries/:summaryId',
  ...requireAuthor,
  validateRequest(updatePlotSummarySchema),
  updatePlotSummaryController
);
storyContextRoutes.delete(
  '/plot-summaries/:summaryId',
  ...requireAuthor,
  validateRequest(plotSummaryIdParamSchema),
  deletePlotSummaryController
);
