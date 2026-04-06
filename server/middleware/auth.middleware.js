import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { 
  verifyAccessToken, 
  extractTokenFromHeader, 
  hasPermission, 
  hasAnyPermission, 
  hasMinimumLevel 
} from '../utils/jwt.js';

/**
 * Base authentication middleware - verifies JWT token
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }
    
    const token = extractTokenFromHeader(authHeader);
    const decoded = verifyAccessToken(token);
    
    // For demo users, skip database lookup
    if (decoded.isDemoUser) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        userType: decoded.userType,
        permissions: decoded.permissions || [],
        level: decoded.level,
        isDemoUser: true,
        isActive: true
      };
      return next();
    }
    
    // Lookup real user in database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }
    
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to failed login attempts.'
      });
    }
    
    // Add user info to request
    req.user = {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      permissions: user.userType === 'deliverer' ? user.delivererInfo?.permissions || [] : [],
      level: user.userType === 'deliverer' ? user.delivererInfo?.level : null,
      recipientInfo: user.recipientInfo,
      delivererInfo: user.delivererInfo,
      isDemoUser: false,
      isActive: user.isActive
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    let message = 'Invalid token';
    let statusCode = 401;
    
    if (error.message === 'Token expired') {
      message = 'Token has expired. Please login again.';
    } else if (error.message === 'Invalid token') {
      message = 'Invalid token format.';
    }
    
    return res.status(statusCode).json({
      success: false,
      message
    });
  }
};

/**
 * Middleware to ensure user is a recipient
 */
export const requireRecipient = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }
  
  if (req.user.userType !== 'recipient') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Recipients only.'
    });
  }
  
  next();
};

/**
 * Middleware to ensure user is a deliverer
 */
export const requireDeliverer = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }
  
  if (req.user.userType !== 'deliverer') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Mail room staff only.'
    });
  }
  
  next();
};

/**
 * Middleware to require specific deliverer level
 */
export const requireLevel = (minLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }
    
    if (req.user.userType !== 'deliverer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Mail room staff only.'
      });
    }
    
    if (!hasMinimumLevel(req.user.level, minLevel)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires level ${minLevel} or higher.`
      });
    }
    
    next();
  };
};

/**
 * Middleware to require specific permission
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }
    
    if (!hasPermission(req.user.permissions, permission)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Missing required permission: ${permission}`
      });
    }
    
    next();
  };
};

/**
 * Middleware to require any of the specified permissions
 */
export const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }
    
    if (!hasAnyPermission(req.user.permissions, permissions)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Missing required permissions: ${permissions.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * Middleware for admin-only access (level 3 deliverers)
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }
  
  if (req.user.userType !== 'deliverer' || req.user.level !== 3) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Administrator access required.'
    });
  }
  
  next();
};

/**
 * Middleware for supervisor+ access (level 2 and 3 deliverers)
 */
export const requireSupervisor = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }
  
  if (req.user.userType !== 'deliverer' || req.user.level < 2) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Supervisor access required.'
    });
  }
  
  next();
};

/**
 * Middleware to allow demo access
 */
export const allowDemo = (req, res, next) => {
  // Allow demo users to proceed
  if (req.user?.isDemoUser) {
    return next();
  }
  
  // For non-demo users, continue with normal auth
  next();
};

/**
 * Middleware to restrict demo users
 */
export const restrictDemo = (req, res, next) => {
  if (req.user?.isDemoUser) {
    return res.status(403).json({
      success: false,
      message: 'This action is not available in demo mode.'
    });
  }
  
  next();
};

/**
 * Middleware for subdomain-based access control
 * mail.com -> recipients
 * admin.mail.com -> deliverers
 */
export const subdomainAuth = (req, res, next) => {
  const host = req.get('host') || '';
  const subdomain = host.split('.')[0];
  
  // Skip subdomain check in development or for localhost
  if (process.env.NODE_ENV === 'development' || 
      host.includes('localhost') || 
      host.includes('barrycumbie.com')) {
    return next();
  }
  
  // Map subdomains to user types
  const subdomainMapping = {
    'mail': 'recipient',
    'admin': 'deliverer',
    'demo': 'both' // Special case for demo
  };
  
  const allowedUserType = subdomainMapping[subdomain];
  
  if (!allowedUserType) {
    return res.status(403).json({
      success: false,
      message: 'Invalid subdomain access.'
    });
  }
  
  // Allow both user types for demo subdomain
  if (allowedUserType === 'both') {
    return next();
  }
  
  // Check if user type matches subdomain
  if (req.user && req.user.userType !== allowedUserType) {
    return res.status(403).json({
      success: false,
      message: `Access denied. This subdomain is for ${allowedUserType}s only.`
    });
  }
  
  next();
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      req.user = null;
      return next();
    }
    
    const token = extractTokenFromHeader(authHeader);
    const decoded = verifyAccessToken(token);
    
    // Handle demo users
    if (decoded.isDemoUser) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        userType: decoded.userType,
        permissions: decoded.permissions || [],
        level: decoded.level,
        isDemoUser: true,
        isActive: true
      };
      return next();
    }
    
    // Lookup real user
    const user = await User.findById(decoded.id).select('-password');
    
    if (user && user.isActive && !user.isLocked) {
      req.user = {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        permissions: user.userType === 'deliverer' ? user.delivererInfo?.permissions || [] : [],
        level: user.userType === 'deliverer' ? user.delivererInfo?.level : null,
        recipientInfo: user.recipientInfo,
        delivererInfo: user.delivererInfo,
        isDemoUser: false,
        isActive: user.isActive
      };
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    // On auth error in optional auth, just set user to null
    req.user = null;
    next();
  }
};