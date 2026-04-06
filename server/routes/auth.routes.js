import express from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate, requireAdmin, optionalAuth } from "../middleware/auth.middleware.js";
import { validateRequest } from "../utils/validation.js";

const router = express.Router();

// Recipients login (mail.com)
router.post("/recipient/login", authController.recipientLogin);

// Deliverers login (admin.mail.com)
router.post("/deliverer/login", authController.delivererLogin);

// Demo login (demo.mail.com)
router.post("/demo/login", authController.demoLogin);

// Registration
router.post("/register", optionalAuth, authController.register);

// Token refresh
router.post("/refresh", authController.refreshToken);

// Password change (authenticated users)
router.post("/change-password", authenticate, authController.changePassword);

// Get current user profile
router.get("/profile", authenticate, authController.getProfile);

// Logout
router.post("/logout", authenticate, authController.logout);

export default router;
