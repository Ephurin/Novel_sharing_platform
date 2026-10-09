import { Router } from 'express';
import { requireAuth, requireRoles } from '../../core/security/auth.middleware.js';
import {
  acceptProposalGroupController,
  activateBaselineController,
  editAndAcceptProposalController,
  getContextPreviewController,
  getJobStatusController,
  getReviewQueueController,
  getStoryBrainSummaryController,
  rejectProposalController,
  startIdeaBootstrapController,
  startManuscriptBootstrapController,
  startWritingGenerationController,
} from './ai-gateway.controller.js';

export const aiGatewayRoutes = Router();

// All AI operations require AUTHOR or ADMIN role
aiGatewayRoutes.use(requireAuth, requireRoles(['AUTHOR', 'ADMIN']));

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
  '/proposals/:proposalId/reject',
  rejectProposalController
);

aiGatewayRoutes.post(
  '/proposals/:proposalId/edit-and-accept',
  editAndAcceptProposalController
);

// Writing Generations
aiGatewayRoutes.post(
  '/writing/generations',
  startWritingGenerationController
);

// Async Jobs
aiGatewayRoutes.get(
  '/jobs/:jobId',
  getJobStatusController
);
