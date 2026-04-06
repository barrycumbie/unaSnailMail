import jwt from 'jsonwebtoken';
import { CONFIG } from '../config/environment.js';

/**
 * Generate access token for user
 */
export const generateAccessToken = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    userType: user.userType,
    permissions: user.userType === 'deliverer' ? user.delivererInfo?.permissions || [] : [],
    level: user.userType === 'deliverer' ? user.delivererInfo?.level : null,
    isDemoUser: user.isDemoUser || false,
    environment: CONFIG.ENVIRONMENT
  };
  
  return jwt.sign(payload, CONFIG.JWT.SECRET, {
    expiresIn: CONFIG.JWT.EXPIRE,
    issuer: 'una-snail-mail',
    subject: user._id.toString()
  });
};

/**
 * Generate refresh token for user
 */
export const generateRefreshToken = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    type: 'refresh'
  };
  
  return jwt.sign(payload, CONFIG.JWT.REFRESH_SECRET, {
    expiresIn: CONFIG.JWT.REFRESH_EXPIRE,
    issuer: 'una-snail-mail',
    subject: user._id.toString()
  });
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = (user) => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
    expiresIn: CONFIG.JWT.EXPIRE
  };
};

/**
 * Verify access token
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, CONFIG.JWT.SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, CONFIG.JWT.REFRESH_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token');
    } else {
      throw new Error('Refresh token verification failed');
    }
  }
};

/**
 * Extract token from Authorization header
 */
export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) {
    throw new Error('No authorization header provided');
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Invalid authorization header format');
  }
  
  return parts[1];
};

/**
 * Check if user has required permission
 */
export const hasPermission = (userPermissions, requiredPermission) => {
  if (!Array.isArray(userPermissions)) return false;
  return userPermissions.includes(requiredPermission);
};

/**
 * Check if user has any of the required permissions
 */
export const hasAnyPermission = (userPermissions, requiredPermissions) => {
  if (!Array.isArray(userPermissions) || !Array.isArray(requiredPermissions)) return false;
  return requiredPermissions.some(permission => userPermissions.includes(permission));
};

/**
 * Check if user has minimum level access (for deliverers)
 */
export const hasMinimumLevel = (userLevel, requiredLevel) => {
  return userLevel >= requiredLevel;
};

/**
 * Generate demo user token (limited permissions)
 */
export const generateDemoToken = () => {
  const payload = {
    id: 'demo-user',
    email: 'demo@una.edu',
    userType: 'deliverer',
    permissions: ['demo_access', 'scan_mail', 'update_status'],
    level: 1,
    isDemoUser: true,
    environment: CONFIG.ENVIRONMENT
  };
  
  return jwt.sign(payload, CONFIG.JWT.SECRET, {
    expiresIn: CONFIG.DEMO.TOKEN_EXPIRE,
    issuer: 'una-snail-mail',
    subject: 'demo-user'
  });
};

/**
 * Generate localhost demo token (extended permissions for local dev)
 */
export const generateLocalhostDemoToken = () => {
  if (!CONFIG.IS_LOCALHOST) {
    return generateDemoToken();
  }
  
  const payload = {
    id: 'localhost-demo-user',
    email: 'localhost-demo@una.edu',
    userType: 'deliverer',
    permissions: [
      'demo_access', 'scan_mail', 'update_status', 
      'view_reports', 'manage_users' // Extended perms for local dev
    ],
    level: 2, // Higher level for local dev
    isDemoUser: true,
    isLocalhost: true,
    environment: CONFIG.ENVIRONMENT
  };
  
  return jwt.sign(payload, CONFIG.JWT.SECRET, {
    expiresIn: '24h', // Longer for local development
    issuer: 'una-snail-mail',
    subject: 'localhost-demo-user'
  });
};

/**
 * Decode token without verification (for debugging)
 */
export const decodeToken = (token) => {
  return jwt.decode(token, { complete: true });
};

/**
 * Check if token is expired without throwing
 */
export const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    return true;
  }
};

export default {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  extractTokenFromHeader,
  hasPermission,
  hasAnyPermission,
  hasMinimumLevel,
  generateDemoToken,
  generateLocalhostDemoToken,
  decodeToken,
  isTokenExpired
};