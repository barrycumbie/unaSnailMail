/**
 * Admin Routes
 * Routes for administrative functions - package oversight, worker management, issue tracking
 */

import express from 'express';
import * as adminController from '../controllers/admin.controller.js';
import {
  authenticate,
  requireDeliverer,
  requirePermission,
  requireAnyPermission,
  restrictDemo
} from '../middleware/auth.middleware.js';

const router = express.Router();

// All admin routes require authentication
router.use(authenticate);

// All admin routes require deliverer status with appropriate permissions
router.use(requireDeliverer);

/**
 * Admin Dashboard & Analytics
 */

// Get comprehensive admin dashboard data (Level 2+ supervisors and admins)
router.get(
  '/dashboard',
  requireAnyPermission(['view_reports', 'manage_users', 'system_admin']),
  adminController.getAdminDashboard
);

/**
 * Package Management & Oversight
 */

// Get all packages with detailed tracking info (Level 2+ with view_reports)
router.get(
  '/packages',
  requirePermission('view_reports'),
  adminController.getAllPackages
);

/**
 * Worker Management & Performance
 */

// Get detailed worker performance analytics (Level 2+ supervisors)
router.get(
  '/workers/:workerId/performance',
  requireAnyPermission(['view_reports', 'manage_users']),
  adminController.getWorkerPerformance
);

// Get worker activity audit trail (Level 3 admins only)
router.get(
  '/audit/worker-activity',
  requirePermission('system_admin'),
  adminController.getWorkerActivityAudit
);

/**
 * Issue Management
 */

// Get comprehensive issue management data (Level 2+ with view_reports)
router.get(
  '/issues',
  requirePermission('view_reports'),
  adminController.getIssueManagement
);

// Assign issue to worker (Level 2+ supervisors)
router.patch(
  '/issues/:issueId/assign',
  requireAnyPermission(['view_reports', 'manage_users']),
  restrictDemo, // Demo users can't assign real issues
  adminController.assignIssue
);

/**
 * Advanced Analytics (Level 3 Admin only)
 */

// Get system-wide performance metrics
router.get(
  '/analytics/system-performance',
  requirePermission('system_admin'),
  async (req, res, next) => {
    try {
      // Advanced system analytics
      const { timeframe = '30d' } = req.query;
      
      // Implementation would go here - detailed system metrics
      res.json({
        success: true,
        message: 'System performance analytics',
        data: {
          // Implementation placeholder
          systemHealth: 'optimal',
          databasePerformance: 'good',
          apiResponseTimes: 'normal'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Export system data for backup/analysis (Level 3 Admin only)
router.get(
  '/export/system-data',
  requirePermission('system_admin'),
  restrictDemo, // Demo users can't export real data
  async (req, res, next) => {
    try {
      const { dataType, format = 'json', dateFrom, dateTo } = req.query;
      
      // Implementation would export various system data
      res.json({
        success: true,
        message: 'System data export initiated',
        data: {
          exportId: 'temp_export_id',
          status: 'processing'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;