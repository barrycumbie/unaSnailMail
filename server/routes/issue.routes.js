import express from 'express';
import * as issueController from '../controllers/issue.controller.js';
import {
  authenticate,
  requireDeliverer,
  requirePermission,
  restrictDemo
} from '../middleware/auth.middleware.js';

const router = express.Router();

// All issue routes require authentication
router.use(authenticate);

// Report new issue (authenticated users)
router.post('/', issueController.reportIssue);

// Get issues (authenticated users - filtered by permissions)
router.get('/', issueController.getIssues);

// Get issue details (authenticated users - filtered by permissions)
router.get('/:issueId', issueController.getIssueDetails);

// Update issue (authenticated users - some actions require deliverer role)
router.patch('/:issueId', issueController.updateIssue);

// Resolve issue (deliverers only)
router.post(
  '/:issueId/resolve',
  requireDeliverer,
  restrictDemo, // Demo users can't resolve real issues
  issueController.resolveIssue
);

// Get issue statistics (deliverers with view_reports permission)
router.get(
  '/stats/overview',
  requireDeliverer,
  requirePermission('view_reports'),
  issueController.getIssueStats
);

export default router;