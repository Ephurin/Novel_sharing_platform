import { requireActiveAccount } from '../../core/security/active-account.js';
import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import {
  acceptProposalGroupController,
  activateBaselineController,
  activateStoryPlanController,
  createStoryPlanController,
  editStoryPlansController,
  editAndAcceptProposalController,
  getActiveStoryPlanController,
  getContextPreviewController,
  getJobStatusController,
  resumeJobController,
  getReviewQueueController,
  getStoryBrainSummaryController,
  getStoryPlanController,
  rejectProposalController,
  rejectProposalGroupController,
  startIdeaBootstrapController,
  getSetupSnapshotController,
  reviewSetupSnapshotController,
  activateSetupM0Controller,
  startManuscriptBootstrapController,
  startWritingGenerationController,
  writingDraftReviewController,
  updateStoryPlanObjectiveController,
  getApprovedMemoryController,
  authorOperationController,
  eventCorrectionController,
  relationshipLockController,
  extractionStatusController,
  authorMemoryProposalController,
  reanalyseSavedChapterController,
  entityProfileController,
  entityGuidanceController,
  entityReviewController,
  authorEntityController,
} from './ai-gateway.controller.js';
import {
  createAutonomousRunController,
  getAutonomousRunController,
  getActiveAutonomousRunController,
  stepAutonomousRunController,
  runAutonomousController,
  stopAutonomousRunController,
} from './autonomous-controller.controller.js';

export const aiGatewayRoutes = Router();

// All AI operations require AUTHOR or ADMIN role with active account
aiGatewayRoutes.use(requireAuth, requireActiveAccount, requireRoles(['AUTHOR', 'ADMIN']));
aiGatewayRoutes.get('/story-brains/:novelId/entities/:entityId/profile', entityProfileController);
aiGatewayRoutes.patch('/story-brains/:novelId/entities/:entityId/profile', entityProfileController);
aiGatewayRoutes.get('/story-brains/:novelId/memory', getApprovedMemoryController);
aiGatewayRoutes.get('/story-brains/:novelId/entity-guidance', entityGuidanceController);
aiGatewayRoutes.post('/story-brains/:novelId/entity-guidance', entityGuidanceController);
aiGatewayRoutes.post('/story-brains/:novelId/author-entities', authorEntityController);
aiGatewayRoutes.get('/story-brains/:novelId/entity-candidate-audits/:runId', entityReviewController);
aiGatewayRoutes.get('/story-brains/:novelId/entity-reviews', entityReviewController);
aiGatewayRoutes.post('/story-brains/:novelId/entity-reviews/:runId/review', entityReviewController);
aiGatewayRoutes.post('/story-brains/:novelId/entity-reviews/:runId/refresh', entityReviewController);
aiGatewayRoutes.post('/story-brains/:novelId/entity-reviews/:runId/continue', entityReviewController);
aiGatewayRoutes.post('/story-brains/:novelId/author-proposals', authorMemoryProposalController);
aiGatewayRoutes.post('/story-brains/:novelId/reanalyse', reanalyseSavedChapterController);
aiGatewayRoutes.get('/story-brains/:novelId/extraction-status', extractionStatusController);
aiGatewayRoutes.post('/story-brains/:novelId/author-operation', authorOperationController);
aiGatewayRoutes.post('/story-brains/:novelId/events/:eventId/corrections', eventCorrectionController);
aiGatewayRoutes.post('/story-brains/:novelId/relationship-locks', relationshipLockController);

// Story Brain / Context endpoints
aiGatewayRoutes.get(
  '/story-brains/:storyBrainId/context-preview',
  getContextPreviewController
);

aiGatewayRoutes.get(
  '/story-brains/by-novel/:novelId',
  getStoryBrainSummaryController
);

aiGatewayRoutes.get(
  '/story-brains/:novelId/review-queue',
  getReviewQueueController
);

aiGatewayRoutes.post(
  '/story-brains/:novelId/baseline/activate',
  activateBaselineController
);

aiGatewayRoutes.get('/story-brains/:novelId/setup', getSetupSnapshotController);
aiGatewayRoutes.post('/story-brains/:novelId/setup/:snapshotId/review', reviewSetupSnapshotController);
aiGatewayRoutes.get('/story-brains/:novelId/setup/:snapshotId/activate', activateSetupM0Controller);
aiGatewayRoutes.post('/story-brains/:novelId/setup/:snapshotId/activate', activateSetupM0Controller);

// Bootstrap
aiGatewayRoutes.post(
  '/story-brains/bootstrap/from-manuscript',
  startManuscriptBootstrapController
);

aiGatewayRoutes.post(
  '/story-brains/bootstrap/from-idea',
  startIdeaBootstrapController
);

// Proposals
aiGatewayRoutes.post(
  '/proposal-groups/:groupId/accept',
  acceptProposalGroupController
);

aiGatewayRoutes.post(
  '/proposal-groups/:groupId/reject',
  rejectProposalGroupController
);

aiGatewayRoutes.post(
  '/proposals/:proposalId/reject',
  rejectProposalController
);

aiGatewayRoutes.post(
  '/proposals/:proposalId/edit-and-accept',
  editAndAcceptProposalController
);

// Writing Generations
aiGatewayRoutes.get('/writing/generations', writingDraftReviewController);
aiGatewayRoutes.post('/writing/generations/:jobId/dismiss', writingDraftReviewController);
aiGatewayRoutes.post(
  '/writing/generations',
  startWritingGenerationController
);

// Story Plans
aiGatewayRoutes.get('/story-plans/edit-v1/:novelId',editStoryPlansController);
aiGatewayRoutes.post('/story-plans/edit-v1/:novelId',editStoryPlansController);
aiGatewayRoutes.get('/story-plans/edit-v1/:novelId/:planId',editStoryPlansController);

aiGatewayRoutes.post(
  '/story-plans',
  createStoryPlanController
);

aiGatewayRoutes.get(
  '/story-plans/by-novel/:novelId/active',
  getActiveStoryPlanController
);

aiGatewayRoutes.get(
  '/story-plans/:planId',
  getStoryPlanController
);

aiGatewayRoutes.post(
  '/story-plans/:planId/activate',
  activateStoryPlanController
);

aiGatewayRoutes.patch(
  '/story-plans/:planId/objectives/:objectiveId',
  updateStoryPlanObjectiveController
);

// Async Jobs
aiGatewayRoutes.get(
  '/jobs/:jobId',
  getJobStatusController
);

aiGatewayRoutes.post(
  '/jobs/:jobId/resume',
  resumeJobController
);

// Autonomous Loop Controller
aiGatewayRoutes.post(
  '/autonomous/runs',
  createAutonomousRunController
);

aiGatewayRoutes.get(
  '/autonomous/runs/:runId',
  getAutonomousRunController
);

aiGatewayRoutes.get(
  '/autonomous/by-novel/:novelId/active',
  getActiveAutonomousRunController
);

aiGatewayRoutes.post(
  '/autonomous/runs/:runId/step',
  stepAutonomousRunController
);

aiGatewayRoutes.post(
  '/autonomous/runs/:runId/run',
  runAutonomousController
);

aiGatewayRoutes.post(
  '/autonomous/runs/:runId/stop',
  stopAutonomousRunController
);

