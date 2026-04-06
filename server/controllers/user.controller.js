import User from '../models/User.js';
import Mail from '../models/Mail.js';
import Issue from '../models/Issue.js';
import { formatValidationError } from '../utils/validation.js';

/**
 * Get current user profile (enhanced)
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
            permissions: req.user.permissions,
            level: req.user.level
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
    
    // Get additional stats for deliverers
    let stats = {};
    if (user.userType === 'deliverer') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      [stats.mailScanned, stats.statusUpdates, stats.issuesResolved] = await Promise.all([
        Mail.countDocuments({
          scannedBy: user._id,
          scanInDate: { $gte: thirtyDaysAgo }
        }),
        Mail.countDocuments({
          lastUpdatedBy: user._id,
          lastStatusUpdate: { $gte: thirtyDaysAgo }
        }),
        Issue.countDocuments({
          resolvedBy: user._id,
          resolvedAt: { $gte: thirtyDaysAgo }
        })
      ]);
    }
    
    // Get mail stats for recipients
    if (user.userType === 'recipient') {
      [stats.totalMail, stats.pendingMail, stats.deliveredMail] = await Promise.all([
        Mail.countDocuments({ recipient: user._id }),
        Mail.countDocuments({
          recipient: user._id,
          status: { $nin: ['DELIVERED', 'PICKED_UP', 'RETURNED_SENDER'] }
        }),
        Mail.countDocuments({
          recipient: user._id,
          status: { $in: ['DELIVERED', 'PICKED_UP'] }
        })
      ]);
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
          createdAt: user.createdAt,
          stats
        }
      }
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    next(error);
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, phone } = req.body;
    
    const updateData = {};
    if (firstName) updateData.firstName = firstName.trim();
    if (lastName) updateData.lastName = lastName.trim();
    if (phone !== undefined) updateData.phone = phone.trim();
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          userType: user.userType
        }
      }
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    next(error);
  }
};

/**
 * Get all deliverers (admin only)
 */
export const getDeliverers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, level, isActive } = req.query;
    
    // Build query
    const query = { userType: 'deliverer' };
    
    if (level) {
      query['delivererInfo.level'] = parseInt(level);
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [deliverers, totalCount] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ 'delivererInfo.level': -1, lastName: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: {
        deliverers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit),
          hasNext: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get deliverers error:', error);
    next(error);
  }
};

/**
 * Update deliverer permissions/level (admin only)
 */
export const updateDeliverer = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { level, permissions, isActive } = req.body;
    
    const user = await User.findOne({
      _id: userId,
      userType: 'deliverer'
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Deliverer not found'
      });
    }
    
    // Update fields
    if (level !== undefined) {
      if (![1, 2, 3].includes(level)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid level. Must be 1, 2, or 3'
        });
      }
      
      user.delivererInfo.level = level;
      
      // Update permissions based on level if not explicitly provided
      if (!permissions) {
        user.delivererInfo.permissions = User.getPermissionsByLevel(level);
      }
    }
    
    if (permissions && Array.isArray(permissions)) {
      const validPermissions = [
        'scan_mail', 'update_status', 'view_reports',
        'manage_users', 'system_admin', 'demo_access'
      ];
      
      const invalidPerms = permissions.filter(p => !validPermissions.includes(p));
      if (invalidPerms.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid permissions: ${invalidPerms.join(', ')}`
        });
      }
      
      user.delivererInfo.permissions = permissions;
    }
    
    if (isActive !== undefined) {
      user.isActive = isActive;
    }
    
    await user.save();
    
    const updatedUser = await User.findById(userId).select('-password');
    
    res.json({
      success: true,
      message: 'Deliverer updated successfully',
      data: {
        user: updatedUser
      }
    });
    
  } catch (error) {
    console.error('Update deliverer error:', error);
    next(error);
  }
};

/**
 * Get recipients (admin/supervisor only)
 */
export const getRecipients = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, classification, building, search } = req.query;
    
    // Build query
    const query = { userType: 'recipient' };
    
    if (classification) {
      query['recipientInfo.classification'] = classification;
    }
    
    if (building) {
      query['recipientInfo.building'] = building;
    }
    
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { 'recipientInfo.studentId': searchRegex },
        { 'recipientInfo.employeeId': searchRegex }
      ];
    }
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [recipients, totalCount] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ lastName: 1, firstName: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: {
        recipients,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit),
          hasNext: parseInt(page) < Math.ceil(totalCount / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Get recipients error:', error);
    next(error);
  }
};

/**
 * Deactivate user (admin only)
 */
export const deactivateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Don't allow deactivating the last admin
    if (user.userType === 'deliverer' && user.delivererInfo.level === 3) {
      const otherAdmins = await User.countDocuments({
        userType: 'deliverer',
        'delivererInfo.level': 3,
        isActive: true,
        _id: { $ne: userId }
      });
      
      if (otherAdmins === 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate the last administrator'
        });
      }
    }
    
    user.isActive = false;
    await user.save();
    
    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
    
  } catch (error) {
    console.error('Deactivate user error:', error);
    next(error);
  }
};

/**
 * Get user activity (admin/supervisor only)
 */
export const getUserActivity = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    let activity = [];
    
    if (user.userType === 'deliverer') {
      // Get recent mail scans and status updates
      const [recentScans, recentUpdates, recentIssues] = await Promise.all([
        Mail.find({ scannedBy: userId })
          .select('trackingNumber type carrier scanInDate')
          .sort({ scanInDate: -1 })
          .limit(parseInt(limit) / 3),
        Mail.find({ lastUpdatedBy: userId })
          .select('trackingNumber status lastStatusUpdate')
          .sort({ lastStatusUpdate: -1 })
          .limit(parseInt(limit) / 3),
        Issue.find({ $or: [{ assignedTo: userId }, { resolvedBy: userId }] })
          .select('issueId status assignedAt resolvedAt')
          .sort({ createdAt: -1 })
          .limit(parseInt(limit) / 3)
      ]);
      
      // Format activity
      activity = [
        ...recentScans.map(item => ({
          type: 'MAIL_SCAN',
          timestamp: item.scanInDate,
          details: `Scanned ${item.type} from ${item.carrier} (${item.trackingNumber})`
        })),
        ...recentUpdates.map(item => ({
          type: 'STATUS_UPDATE',
          timestamp: item.lastStatusUpdate,
          details: `Updated ${item.trackingNumber} to ${item.status}`
        })),
        ...recentIssues.map(item => ({
          type: item.resolvedAt ? 'ISSUE_RESOLVED' : 'ISSUE_ASSIGNED',
          timestamp: item.resolvedAt || item.assignedAt || item.createdAt,
          details: `${item.resolvedAt ? 'Resolved' : 'Assigned'} issue ${item.issueId}`
        }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, parseInt(limit));
    }
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          userType: user.userType
        },
        activity
      }
    });
    
  } catch (error) {
    console.error('Get user activity error:', error);
    next(error);
  }
};