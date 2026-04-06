import Issue from '../models/Issue.js';
import Mail from '../models/Mail.js';
import User from '../models/User.js';
import { 
  validateIssueReport, 
  validateIssueUpdate,
  formatValidationError 
} from '../utils/validation.js';

/**
 * Report a new issue
 */
export const reportIssue = async (req, res, next) => {
  try {
    const { error, value } = validateIssueReport(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const issueData = value;
    
    // If mailId is provided, verify it exists and user has access
    if (issueData.mailId) {
      const mail = await Mail.findById(issueData.mailId);
      
      if (!mail) {
        return res.status(404).json({
          success: false,
          message: 'Mail item not found'
        });
      }
      
      // Recipients can only report issues for their own mail
      if (req.user.userType === 'recipient') {
        if (!mail.recipient || mail.recipient.toString() !== req.user.id) {
          return res.status(403).json({
            success: false,
            message: 'You can only report issues for your own mail'
          });
        }
      }
      
      issueData.trackingNumber = mail.trackingNumber;
    }
    
    // Create issue
    const newIssue = new Issue({
      ...issueData,
      reportedBy: req.user.id,
      reporterInfo: {
        name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
        email: req.user.email,
        phone: req.user.phone,
        userType: req.user.userType
      },
      isDemoData: req.user.isDemoUser || false,
      // Set SLA targets based on priority
      slaInfo: {
        responseTimeTarget: getSLAResponseTime(issueData.priority),
        resolutionTimeTarget: getSLAResolutionTime(issueData.priority)
      }
    });
    
    await newIssue.save();
    
    // Populate the saved issue
    const populatedIssue = await Issue.findById(newIssue._id)
      .populate('reportedBy', 'firstName lastName email')
      .populate('mailId', 'trackingNumber type carrier status');
    
    res.status(201).json({
      success: true,
      message: 'Issue reported successfully',
      data: {
        issue: populatedIssue
      }
    });
    
  } catch (error) {
    console.error('Report issue error:', error);
    next(error);
  }
};

/**
 * Get issues (with filtering and pagination)
 */
export const getIssues = async (req, res, next) => {
  try {
    const {
      status,
      category,
      priority,
      assignedTo,
      reportedBy,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    let query = {};
    
    // For recipients, only show their own issues
    if (req.user.userType === 'recipient') {
      query.reportedBy = req.user.id;
    }
    
    // For demo users, only show demo issues
    if (req.user.isDemoUser) {
      query.isDemoData = true;
    }
    
    // Apply filters
    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }
    
    if (category) {
      query.category = Array.isArray(category) ? { $in: category } : category;
    }
    
    if (priority) {
      query.priority = Array.isArray(priority) ? { $in: priority } : priority;
    }
    
    if (assignedTo && req.user.userType === 'deliverer') {
      query.assignedTo = assignedTo;
    }
    
    if (reportedBy && req.user.userType === 'deliverer') {
      query.reportedBy = reportedBy;
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [issues, totalCount] = await Promise.all([
      Issue.find(query)
        .populate('reportedBy', 'firstName lastName email')
        .populate('assignedTo', 'firstName lastName email')
        .populate('mailId', 'trackingNumber type carrier status')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Issue.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: {
        issues,
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
    console.error('Get issues error:', error);
    next(error);
  }
};

/**
 * Get issue details
 */
export const getIssueDetails = async (req, res, next) => {
  try {
    const { issueId } = req.params;
    
    const issue = await Issue.findById(issueId)
      .populate('reportedBy', 'firstName lastName email phone')
      .populate('assignedTo', 'firstName lastName email')
      .populate('assignedBy', 'firstName lastName email')
      .populate('resolvedBy', 'firstName lastName email')
      .populate('mailId', 'trackingNumber type carrier status recipient')
      .populate('updates.addedBy', 'firstName lastName email');
    
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    // Check access permissions
    if (req.user.userType === 'recipient') {
      if (issue.reportedBy._id.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own issues.'
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        issue
      }
    });
    
  } catch (error) {
    console.error('Get issue details error:', error);
    next(error);
  }
};

/**
 * Update issue (add comment, change status, assign, etc.)
 */
export const updateIssue = async (req, res, next) => {
  try {
    const { issueId } = req.params;
    const { error, value } = validateIssueUpdate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const { message, isInternal, status, assignTo, priority } = value;
    
    // Find issue
    const issue = await Issue.findById(issueId);
    
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    // Check permissions
    if (req.user.userType === 'recipient') {
      // Recipients can only add public comments to their own issues
      if (issue.reportedBy.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      if (isInternal || status || assignTo || priority) {
        return res.status(403).json({
          success: false,
          message: 'Recipients cannot perform administrative actions'
        });
      }
    }
    
    // Add update message
    if (message) {
      await issue.addUpdate(message, req.user.id, isInternal || false);
    }
    
    // Update status if provided (deliverers only)
    if (status && req.user.userType === 'deliverer') {
      issue.status = status;
      
      if (status === 'IN_PROGRESS' && !issue.slaInfo.respondedAt) {
        issue.slaInfo.respondedAt = new Date();
      }
    }
    
    // Assign issue if provided (deliverers only)
    if (assignTo && req.user.userType === 'deliverer') {
      const assignee = await User.findById(assignTo);
      if (!assignee || assignee.userType !== 'deliverer') {
        return res.status(400).json({
          success: false,
          message: 'Invalid assignee'
        });
      }
      
      await issue.assignTo(assignTo, req.user.id);
    }
    
    // Update priority if provided (deliverers only)
    if (priority && req.user.userType === 'deliverer') {
      issue.priority = priority;
      // Update SLA targets based on new priority
      issue.slaInfo.responseTimeTarget = getSLAResponseTime(priority);
      issue.slaInfo.resolutionTimeTarget = getSLAResolutionTime(priority);
    }
    
    await issue.save();
    
    // Return updated issue
    const updatedIssue = await Issue.findById(issueId)
      .populate('reportedBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('updates.addedBy', 'firstName lastName email');
    
    res.json({
      success: true,
      message: 'Issue updated successfully',
      data: {
        issue: updatedIssue
      }
    });
    
  } catch (error) {
    console.error('Update issue error:', error);
    next(error);
  }
};

/**
 * Resolve issue
 */
export const resolveIssue = async (req, res, next) => {
  try {
    const { issueId } = req.params;
    const { resolution, resolverNotes } = req.body;
    
    if (!resolution) {
      return res.status(400).json({
        success: false,
        message: 'Resolution is required'
      });
    }
    
    const validResolutions = [
      'RESOLVED_DELIVERED', 'RESOLVED_FOUND', 'RESOLVED_REPLACED',
      'RESOLVED_REFUNDED', 'RESOLVED_CARRIER_FAULT', 'RESOLVED_USER_ERROR',
      'RESOLVED_SYSTEM_FIX', 'UNRESOLVABLE'
    ];
    
    if (!validResolutions.includes(resolution)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resolution'
      });
    }
    
    // Find issue
    const issue = await Issue.findById(issueId);
    
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    // Only deliverers can resolve issues
    if (req.user.userType !== 'deliverer') {
      return res.status(403).json({
        success: false,
        message: 'Only mail room staff can resolve issues'
      });
    }
    
    // Resolve issue
    await issue.resolve(resolution, resolverNotes, req.user.id);
    
    const resolvedIssue = await Issue.findById(issueId)
      .populate('reportedBy', 'firstName lastName email')
      .populate('resolvedBy', 'firstName lastName email');
    
    res.json({
      success: true,
      message: 'Issue resolved successfully',
      data: {
        issue: resolvedIssue
      }
    });
    
  } catch (error) {
    console.error('Resolve issue error:', error);
    next(error);
  }
};

/**
 * Get issue statistics
 */
export const getIssueStats = async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    // Only deliverers can view stats
    if (req.user.userType !== 'deliverer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Date range filter
    let dateRange = {};
    if (dateFrom) dateRange.start = new Date(dateFrom);
    if (dateTo) dateRange.end = new Date(dateTo);
    
    const [
      issueStats,
      openIssues,
      categoryBreakdown,
      priorityBreakdown
    ] = await Promise.all([
      Issue.getIssueStats(dateRange),
      Issue.getOpenIssues(),
      Issue.aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            avgResolutionTime: {
              $avg: {
                $cond: [
                  { $ne: ['$resolvedAt', null] },
                  { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] },
                  null
                ]
              }
            }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Issue.aggregate([
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        summary: issueStats[0] || {
          totalIssues: 0,
          openIssues: 0,
          resolvedIssues: 0,
          avgResolutionTime: 0
        },
        openIssuesCount: openIssues.length,
        categoryBreakdown,
        priorityBreakdown
      }
    });
    
  } catch (error) {
    console.error('Get issue stats error:', error);
    next(error);
  }
};

// Helper functions
function getSLAResponseTime(priority) {
  const slaTargets = {
    'URGENT': 1,   // 1 hour
    'HIGH': 4,     // 4 hours
    'MEDIUM': 8,   // 8 hours
    'LOW': 24      // 24 hours
  };
  return slaTargets[priority] || 8;
}

function getSLAResolutionTime(priority) {
  const slaTargets = {
    'URGENT': 4,   // 4 hours
    'HIGH': 24,    // 24 hours
    'MEDIUM': 72,  // 72 hours
    'LOW': 168     // 1 week
  };
  return slaTargets[priority] || 72;
}