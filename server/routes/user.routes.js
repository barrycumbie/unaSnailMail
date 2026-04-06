import express from "express";
import * as userController from '../controllers/user.controller.js';
import {
  authenticate,
  requireAdmin,
  requireSupervisor,
  requireDeliverer,
  requirePermission
} from '../middleware/auth.middleware.js';

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

// Get current user profile
router.get('/profile', userController.getProfile);

// Update current user profile
router.patch('/profile', userController.updateProfile);

// Get all deliverers (admin only)
router.get(
  '/deliverers',
  requireAdmin,
  userController.getDeliverers
);

// Update deliverer (admin only)
router.patch(
  '/deliverers/:userId',
  requireAdmin,
  userController.updateDeliverer
);

// Get recipients (admin/supervisor only)
router.get(
  '/recipients',
  requireSupervisor,
  userController.getRecipients
);

// Deactivate user (admin only)
router.delete(
  '/:userId/deactivate',
  requireAdmin,
  userController.deactivateUser
);

// Get user activity (admin/supervisor only)
router.get(
  '/:userId/activity',
  requireSupervisor,
  userController.getUserActivity
);

export default router;
