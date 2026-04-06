import express from 'express';
import * as dashboardController from '../controllers/dashboard.controller.js';
import {
  authenticate,
  requireRecipient,
  requireDeliverer,
  requireAdmin,
  requirePermission
} from '../middleware/auth.middleware.js';

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// Recipient dashboard
router.get(
  '/recipient',
  requireRecipient,
  dashboardController.getRecipientDashboard
);

// Deliverer dashboard
router.get(
  '/deliverer',
  requireDeliverer,
  dashboardController.getDelivererDashboard
);

// Admin dashboard (level 3 deliverers only)
router.get(
  '/admin',
  requireAdmin,
  dashboardController.getAdminDashboard
);

// Analytics (deliverers with view_reports permission)
router.get(
  '/analytics',
  requireDeliverer,
  requirePermission('view_reports'),
  dashboardController.getAnalytics
);

export default router;
