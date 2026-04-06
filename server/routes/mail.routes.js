import express from 'express';
import * as mailController from '../controllers/mail.controller.js';
import {
  authenticate,
  requireDeliverer,
  requirePermission,
  requireAnyPermission,
  restrictDemo,
  optionalAuth
} from '../middleware/auth.middleware.js';

const router = express.Router();

// Public tracking endpoint (no auth required)
router.get('/track/:trackingNumber', mailController.trackByNumber);

// Protected routes (require authentication)
router.use(authenticate);

// Scan new mail (deliverers only with scan_mail permission)
router.post(
  '/scan',
  requireDeliverer,
  requirePermission('scan_mail'),
  restrictDemo, // Demo users can't scan real mail
  mailController.scanMail
);

// Update mail status (deliverers only with update_status permission)
router.patch(
  '/:mailId/status',
  requireDeliverer,
  requirePermission('update_status'),
  mailController.updateStatus
);

// Get mail details (authenticated users)
router.get('/:mailId', mailController.getMailDetails);

// Search mail (authenticated users)
router.get('/', mailController.searchMail);

// Get mail statistics (deliverers with view_reports permission)
router.get(
  '/stats/overview',
  requireDeliverer,
  requirePermission('view_reports'),
  mailController.getMailStats
);

// Bulk operations (deliverers only with update_status permission)
router.post(
  '/bulk/status',
  requireDeliverer,
  requirePermission('update_status'),
  restrictDemo, // Demo users can't bulk update
  mailController.bulkUpdateStatus
);

// === CARRIER TRACKING ROUTES ===

// Track package with carrier APIs (authenticated users)
router.get(
  '/carriers/track/:trackingNumber',
  mailController.trackWithCarrier
);

// Validate tracking number format (authenticated users)
router.get(
  '/carriers/validate',
  mailController.validateTrackingNumber
);

// Get carrier service status (authenticated users)
router.get(
  '/carriers/status',
  mailController.getCarrierStatus
);

// Bulk track packages (deliverers with view_reports permission)
router.post(
  '/carriers/bulk-track',
  requireDeliverer,
  requirePermission('view_reports'),
  mailController.bulkTrackPackages
);

// Refresh all tracking data (supervisors and admins only)
router.post(
  '/carriers/refresh-all',
  requireDeliverer,
  requireAnyPermission(['view_reports', 'manage_users']), // Level 2+ permissions
  mailController.refreshAllTracking
);

// === INTERNAL PACKAGE ROUTES ===

// Generate internal tracking number and create package (deliverers with scan_mail permission)
router.post(
  '/internal/generate',
  requireDeliverer,
  requirePermission('scan_mail'),
  mailController.generateInternalPackage
);

// Generate shipping label for internal package (deliverers only)
router.get(
  '/internal/label/:trackingNumber',
  requireDeliverer,
  mailController.generateShippingLabel
);

// Validate internal tracking number format (authenticated users)
router.get(
  '/internal/validate',
  mailController.validateInternalTracking
);

// Generate bulk internal packages (deliverers with scan_mail permission)
router.post(
  '/internal/bulk',
  requireDeliverer,
  requirePermission('scan_mail'),
  mailController.generateBulkInternalPackages
);

// Get internal package statistics (deliverers with view_reports permission)
router.get(
  '/internal/stats',
  requireDeliverer,
  requirePermission('view_reports'),
  mailController.getInternalPackageStats
);

export default router;