import User from '../models/User.js';
import { 
  generateTokenPair, 
  verifyRefreshToken, 
  generateAccessToken,
  generateDemoToken,
  generateLocalhostDemoToken
} from '../utils/jwt.js';
import { 
  validateUserLogin, 
  validateUserRegistration, 
  validatePasswordChange,
  validateDemoAccess,
  formatValidationError 
} from '../utils/validation.js';
import { CONFIG, isLocalhost } from '../config/environment.js';

/**
 * Login for recipients (mail.com)
 */
export const recipientLogin = async (req, res, next) => {
  try {
    const { error, value } = validateUserLogin(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const { email, password, rememberMe } = value;
    
    // Find user and verify they are a recipient
    const user = await User.findOne({ 
      email, 
      userType: 'recipient',
      isActive: true 
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to failed login attempts. Please try again later.'
      });
    }
    
    // Verify password
    const isValidPassword = await user.comparePassword(password);
    
    if (!isValidPassword) {
      await user.increaseLoginAttempts();
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate tokens
    const tokens = generateTokenPair(user);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          recipientInfo: user.recipientInfo
        },
        ...tokens
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Login for deliverers (admin.mail.com)
 */
export const delivererLogin = async (req, res, next) => {
  try {
    const { error, value } = validateUserLogin(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const { email, password, rememberMe } = value;
    
    // Find user and verify they are a deliverer
    const user = await User.findOne({ 
      email, 
      userType: 'deliverer',
      isActive: true 
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to failed login attempts. Please try again later.'
      });
    }
    
    // Verify password
    const isValidPassword = await user.comparePassword(password);
    
    if (!isValidPassword) {
      await user.increaseLoginAttempts();
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }
    
    // Update last login and set permissions based on level
    user.lastLogin = new Date();
    
    // Set permissions based on level if not already set
    if (!user.delivererInfo.permissions || user.delivererInfo.permissions.length === 0) {
      user.delivererInfo.permissions = User.getPermissionsByLevel(user.delivererInfo.level);
      await user.save();
    }
    
    await user.save();
    
    // Generate tokens
    const tokens = generateTokenPair(user);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          delivererInfo: {
            level: user.delivererInfo.level,
            permissions: user.delivererInfo.permissions,
            department: user.delivererInfo.department
          }
        },
        ...tokens
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Demo login (demo.mail.com or localhost auto-demo)
 */
export const demoLogin = async (req, res, next) => {
  try {
    const { error, value } = validateDemoAccess(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const { demoCode, duration } = value;
    
    // For localhost, allow access without demo code or accept 'LOCALHOST'
    if (isLocalhost()) {
      if (!demoCode || CONFIG.DEMO.CODES.includes(demoCode) || demoCode === 'LOCALHOST') {
        const token = generateLocalhostDemoToken();
        
        return res.json({
          success: true,
          message: `🏠 Localhost demo access granted with enhanced permissions`,
          data: {
            user: {
              id: 'localhost-demo-user',
              email: 'localhost-demo@una.edu',
              firstName: 'Localhost',
              lastName: 'Demo',
              userType: 'deliverer',
              isDemoUser: true,
              isLocalhost: true,
              level: 2
            },
            accessToken: token,
            expiresIn: '24h',
            environment: CONFIG.ENVIRONMENT,
            features: {
              extendedPermissions: true,
              noTimeLimit: true,
              fullAccess: true
            }
          }
        });
      }
    }
    
    // Regular demo code validation for non-localhost
    if (demoCode && !CONFIG.DEMO.CODES.includes(demoCode)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid demo code'
      });
    }
    
    // Generate regular demo token
    const token = generateDemoToken();
    
    res.json({
      success: true,
      message: '🎭 Demo access granted',
      data: {
        user: {
          id: 'demo-user',
          email: 'demo@una.edu',
          firstName: 'Demo',
          lastName: 'User',
          userType: 'deliverer',
          isDemoUser: true
        },
        accessToken: token,
        expiresIn: CONFIG.DEMO.TOKEN_EXPIRE,
        environment: CONFIG.ENVIRONMENT
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Register new user (admin only for deliverers, self-registration for recipients)
 */
export const register = async (req, res, next) => {
  try {
    const { error, value } = validateUserRegistration(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const userData = value;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // For deliverer registration, require admin authorization
    if (userData.userType === 'deliverer') {
      if (!req.user || req.user.userType !== 'deliverer' || req.user.level !== 3) {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can register new mail room staff'
        });
      }
    }
    
    // Set permissions for deliverers
    if (userData.userType === 'deliverer') {
      userData.delivererInfo.permissions = User.getPermissionsByLevel(userData.delivererInfo.level);
    }
    
    // Create new user
    const newUser = new User(userData);
    await newUser.save();
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: newUser._id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          userType: newUser.userType
        }
      }
    });
    
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    next(error);
  }
};

/**
 * Refresh access token
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }
    
    const decoded = verifyRefreshToken(refreshToken);
    
    // Find user
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }
    
    // Generate new access token
    const newAccessToken = generateAccessToken(user);
    
    res.json({
      success: true,
      data: {
        accessToken: newAccessToken
      }
    });
    
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token'
    });
  }
};

/**
 * Change password
 */
export const changePassword = async (req, res, next) => {
  try {
    const { error, value } = validatePasswordChange(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const { currentPassword, newPassword } = value;
    const userId = req.user.id;
    
    // Find user with password
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Verify current password
    const isValidCurrentPassword = await user.comparePassword(currentPassword);
    
    if (!isValidCurrentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req, res, next) => {
  try {
    if (req.user.isDemoUser) {
      return res.json({
        success: true,
        data: {
          user: {
            id: req.user.id,
            email: req.user.email,
            firstName: 'Demo',
            lastName: 'User',
            userType: req.user.userType,
            isDemoUser: true,
            permissions: req.user.permissions
          }
        }
      });
    }
    
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          userType: user.userType,
          recipientInfo: user.recipientInfo,
          delivererInfo: user.delivererInfo,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * Logout (client-side token removal, server-side could implement token blacklisting)
 */
export const logout = async (req, res, next) => {
  try {
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};
