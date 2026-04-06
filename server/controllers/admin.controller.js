/**
 * Admin Controller
 * Comprehensive admin panel for package oversight, worker management, and system analytics
 */

import Mail from '../models/Mail.js';
import User from '../models/User.js';
import Issue from '../models/Issue.js';
import TrackingHistory from '../models/TrackingHistory.js';
import mongoose from 'mongoose';

/**
 * Get comprehensive admin dashboard data
 */
export const getAdminDashboard = async (req, res, next) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Parallel data fetching
    const [
      totalStats,
      workerStats,
      issueStats,
      recentActivity,
      topPerformers,
      problemAreas,
      carrierBreakdown
    ] = await Promise.all([
      getTotalStats(startDate),
      getWorkerStats(startDate),
      getIssueStats(startDate),
      getRecentActivity(50),
      getTopPerformers(startDate),
      getProblemAreas(startDate),
      getCarrierBreakdown(startDate)
    ]);

    res.json({
      success: true,
      data: {
        timeframe,
        dateRange: { start: startDate, end: now },
        overview: totalStats,
        workers: workerStats,
        issues: issueStats,
        recentActivity,
        performance: {
          topPerformers,
          problemAreas
        },
        carriers: carrierBreakdown
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    next(error);
  }
};

/**
 * Get detailed worker performance analytics
 */
export const getWorkerPerformance = async (req, res, next) => {
  try {
    const { workerId } = req.params;
    const { timeframe = '30d' } = req.query;

    // Validate worker exists and is a deliverer
    const worker = await User.findById(workerId);
    if (!worker || worker.userType !== 'deliverer') {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    const startDate = calculateStartDate(timeframe);

    // Get comprehensive worker analytics
    const [
      packagesHandled,
      averageProcessingTime,
      issueResolution,
      activityBreakdown,
      qualityMetrics,
      shiftAnalysis
    ] = await Promise.all([
      getWorkerPackageStats(workerId, startDate),
      getWorkerProcessingTime(workerId, startDate),
      getWorkerIssueStats(workerId, startDate),
      getWorkerActivityBreakdown(workerId, startDate),
      getWorkerQualityMetrics(workerId, startDate),
      getWorkerShiftAnalysis(workerId, startDate)
    ]);

    res.json({
      success: true,
      data: {
        worker: {
          id: worker._id,
          name: `${worker.firstName} ${worker.lastName}`,
          email: worker.email,
          level: worker.delivererInfo?.level,
          employeeId: worker.delivererInfo?.employeeId,
          permissions: worker.delivererInfo?.permissions
        },
        timeframe,
        performance: {
          packagesHandled,
          averageProcessingTime,
          issueResolution,
          activityBreakdown,
          qualityMetrics,
          shiftAnalysis
        }
      }
    });

  } catch (error) {
    console.error('Worker performance error:', error);
    next(error);
  }
};

/**
 * Get all packages with detailed tracking and worker information
 */
export const getAllPackages = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      carrier,
      worker,
      dateFrom,
      dateTo,
      Priority,
      sortBy = 'scanInDate',
      sortOrder = 'desc'
    } = req.query;

    // Build query filters
    const filters = {};
    
    if (status) filters.status = status;
    if (carrier) filters.carrier = carrier;
    if (worker) {
      filters.$or = [
        { scannedBy: worker },
        { lastUpdatedBy: worker },
        { deliveredBy: worker }
      ];
    }
    
    if (dateFrom || dateTo) {
      filters.scanInDate = {};
      if (dateFrom) filters.scanInDate.$gte = new Date(dateFrom);
      if (dateTo) filters.scanInDate.$lte = new Date(dateTo);
    }

    // Calculate skip and limit
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    // Get packages with worker information
    const packages = await Mail.find(filters)
      .populate('recipient', 'firstName lastName email recipientInfo')
      .populate('scannedBy', 'firstName lastName email delivererInfo')
      .populate('lastUpdatedBy', 'firstName lastName email delivererInfo')
      .populate('deliveredBy', 'firstName lastName email delivererInfo')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalCount = await Mail.countDocuments(filters);

    // Enrich with recent activity for each package
    const enrichedPackages = await Promise.all(
      packages.map(async (pkg) => {
        const recentActivity = await TrackingHistory.find({ mailId: pkg._id })
          .populate('updatedBy', 'firstName lastName email')
          .sort({ timestamp: -1 })
          .limit(3)
          .lean();

        return {
          ...pkg,
          recentActivity
        };
      })
    );

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    res.json({
      success: true,
      data: {
        packages: enrichedPackages,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext,
          hasPrev,
          limit: parseInt(limit)
        },
        filters: {
          status,
          carrier,
          worker,
          dateFrom,
          dateTo,
          sortBy,
          sortOrder
        }
      }
    });

  } catch (error) {
    console.error('Get all packages error:', error);
    next(error);
  }
};

/**
 * Get comprehensive issue management data
 */
export const getIssueManagement = async (req, res, next) => {
  try {
    const { 
      status = 'all',
      priority,
      category,
      assignedTo,
      page = 1,
      limit = 20
    } = req.query;

    // Build filters
    const filters = {};
    if (status !== 'all') filters.status = status;
    if (priority) filters.priority = priority;
    if (category) filters.category = category;
    if (assignedTo) filters.assignedTo = assignedTo;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get issues with full population
    const issues = await Issue.find(filters)
      .populate('mailId', 'trackingNumber carrier type recipientName')
      .populate('reportedBy', 'firstName lastName email userType')
      .populate('assignedTo', 'firstName lastName email delivererInfo')
      .populate('resolvedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalCount = await Issue.countDocuments(filters);

    // Get issue statistics
    const issueStats = await Issue.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byStatus: {
            $push: '$status'
          },
          byPriority: {
            $push: '$priority'
          },
          byCategory: {
            $push: '$category'
          },
          averageResolutionTime: {
            $avg: {
              $subtract: ['$resolvedAt', '$createdAt']
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        issues,
        statistics: issueStats[0] || {},
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNext: page < Math.ceil(totalCount / parseInt(limit)),
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Issue management error:', error);
    next(error);
  }
};

/**
 * Get worker activity audit trail
 */
export const getWorkerActivityAudit = async (req, res, next) => {
  try {
    const { 
      workerId,
      dateFrom,
      dateTo,
      action,
      page = 1,
      limit = 100
    } = req.query;

    // Build filters
    const filters = {};
    if (workerId) filters.updatedBy = workerId;
    if (action) filters.newStatus = action;
    
    if (dateFrom || dateTo) {
      filters.timestamp = {};
      if (dateFrom) filters.timestamp.$gte = new Date(dateFrom);
      if (dateTo) filters.timestamp.$lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get activity history with full details
    const activities = await TrackingHistory.find(filters)
      .populate('updatedBy', 'firstName lastName email delivererInfo')
      .populate('mailId', 'trackingNumber carrier type recipientName')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await TrackingHistory.countDocuments(filters);

    // Group by worker for summary stats
    const workerSummary = await TrackingHistory.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$updatedBy',
          totalActions: { $sum: 1 },
          lastActivity: { $max: '$timestamp' },
          actionBreakdown: { $push: '$newStatus' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'workerInfo'
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        activities,
        workerSummary,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount
        }
      }
    });

  } catch (error) {
    console.error('Worker activity audit error:', error);
    next(error);
  }
};

/**
 * Assign issue to worker
 */
export const assignIssue = async (req, res, next) => {
  try {
    const { issueId } = req.params;
    const { assignedTo, notes } = req.body;

    const issue = await Issue.findById(issueId);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }

    // Validate assignee is a deliverer
    const assignee = await User.findById(assignedTo);
    if (!assignee || assignee.userType !== 'deliverer') {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignee - must be a deliverer'
      });
    }

    // Update issue
    issue.assignedTo = assignedTo;
    issue.assignedBy = req.user.id;
    issue.assignedAt = new Date();
    issue.status = 'IN_PROGRESS';

    // Add update note
    if (notes) {
      issue.updates.push({
        message: notes,
        addedBy: req.user.id,
        isInternal: true
      });
    }

    await issue.save();

    // Populate for response
    await issue.populate('assignedTo', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Issue assigned successfully',
      data: issue
    });

  } catch (error) {
    console.error('Assign issue error:', error);
    next(error);
  }
};

/**
 * Helper Functions
 */

async function getTotalStats(startDate) {
  return await Mail.aggregate([
    { $match: { scanInDate: { $gte: startDate } } },
    {
      $group: {
        _id: null,
        totalPackages: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $in: ['$status', ['DELIVERED', 'PICKED_UP']] }, 1, 0] }
        },
        inProgress: {
          $sum: { $cond: [{ $in: ['$status', ['PROCESSING', 'OUT_DELIVERY', 'READY_PICKUP']] }, 1, 0] }
        },
        issues: {
          $sum: { $cond: [{ $in: ['$status', ['EXCEPTION', 'LOST', 'DAMAGED']] }, 1, 0] }
        },
        avgProcessingTime: {
          $avg: {
            $divide: [
              { $subtract: ['$actualDeliveryDate', '$scanInDate'] },
              1000 * 60 * 60 * 24 // Convert to days
            ]
          }
        }
      }
    }
  ]);
}

async function getWorkerStats(startDate) {
  return await TrackingHistory.aggregate([
    { $match: { timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: '$updatedBy',
        totalActions: { $sum: 1 },
        lastActivity: { $max: '$timestamp' },
        statusChanges: { $push: '$newStatus' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'worker'
      }
    },
    { $unwind: '$worker' },
    { $match: { 'worker.userType': 'deliverer' } },
    { $sort: { totalActions: -1 } },
    { $limit: 10 }
  ]);
}

async function getIssueStats(startDate) {
  return await Issue.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: null,
        totalIssues: { $sum: 1 },
        openIssues: {
          $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] }
        },
        resolvedIssues: {
          $sum: { $cond: [{ $eq: ['$status', 'RESOLVED'] }, 1, 0] }
        },
        averageResolutionTime: {
          $avg: {
            $divide: [
              { $subtract: ['$resolvedAt', '$createdAt'] },
              1000 * 60 * 60 // Convert to hours
            ]
          }
        }
      }
    }
  ]);
}

async function getRecentActivity(limit) {
  return await TrackingHistory.find()
    .populate('updatedBy', 'firstName lastName email userType delivererInfo')
    .populate('mailId', 'trackingNumber carrier type recipientName')
    .sort({ timestamp: -1 })
    .limit(limit);
}

async function getTopPerformers(startDate) {
  return await TrackingHistory.aggregate([
    { $match: { timestamp: { $gte: startDate } } },
    {
      $group: {
        _id: '$updatedBy',
        totalActions: { $sum: 1 },
        packagesProcessed: { $addToSet: '$mailId' }
      }
    },
    {
      $addFields: {
        uniquePackages: { $size: '$packagesProcessed' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'worker'
      }
    },
    { $unwind: '$worker' },
    { $match: { 'worker.userType': 'deliverer' } },
    { $sort: { uniquePackages: -1, totalActions: -1 } },
    { $limit: 5 }
  ]);
}

async function getProblemAreas(startDate) {
  return await Issue.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgResolutionTime: {
          $avg: {
            $divide: [
              { $subtract: ['$resolvedAt', '$createdAt'] },
              1000 * 60 * 60
            ]
          }
        }
      }
    },
    { $sort: { count: -1 } }
  ]);
}

async function getCarrierBreakdown(startDate) {
  return await Mail.aggregate([
    { $match: { scanInDate: { $gte: startDate } } },
    {
      $group: {
        _id: '$carrier',
        totalPackages: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $in: ['$status', ['DELIVERED', 'PICKED_UP']] }, 1, 0] }
        },
        issues: {
          $sum: { $cond: [{ $in: ['$status', ['EXCEPTION', 'LOST', 'DAMAGED']] }, 1, 0] }
        }
      }
    },
    {
      $addFields: {
        deliveryRate: { $divide: ['$delivered', '$totalPackages'] },
        issueRate: { $divide: ['$issues', '$totalPackages'] }
      }
    },
    { $sort: { totalPackages: -1 } }
  ]);
}

// Additional helper functions for worker performance
function calculateStartDate(timeframe) {
  const now = new Date();
  const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 365;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function getWorkerPackageStats(workerId, startDate) {
  return await Mail.aggregate([
    {
      $match: {
        $and: [
          { scanInDate: { $gte: startDate } },
          {
            $or: [
              { scannedBy: new mongoose.Types.ObjectId(workerId) },
              { lastUpdatedBy: new mongoose.Types.ObjectId(workerId) },
              { deliveredBy: new mongoose.Types.ObjectId(workerId) }
            ]
          }
        ]
      }
    },
    {
      $group: {
        _id: null,
        totalPackages: { $sum: 1 },
        scanned: {
          $sum: { $cond: [{ $eq: ['$scannedBy', new mongoose.Types.ObjectId(workerId)] }, 1, 0] }
        },
        delivered: {
          $sum: { $cond: [{ $eq: ['$deliveredBy', new mongoose.Types.ObjectId(workerId)] }, 1, 0] }
        }
      }
    }
  ]);
}

async function getWorkerProcessingTime(workerId, startDate) {
  return await TrackingHistory.aggregate([
    {
      $match: {
        updatedBy: new mongoose.Types.ObjectId(workerId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $lookup: {
        from: 'mails',
        localField: 'mailId',
        foreignField: '_id',
        as: 'mail'
      }
    },
    { $unwind: '$mail' },
    {
      $group: {
        _id: '$mailId',
        firstAction: { $min: '$timestamp' },
        lastAction: { $max: '$timestamp' }
      }
    },
    {
      $group: {
        _id: null,
        avgProcessingTime: {
          $avg: { $subtract: ['$lastAction', '$firstAction'] }
        }
      }
    }
  ]);
}

async function getWorkerIssueStats(workerId, startDate) {
  return await Issue.aggregate([
    {
      $match: {
        $or: [
          { assignedTo: new mongoose.Types.ObjectId(workerId) },
          { resolvedBy: new mongoose.Types.ObjectId(workerId) }
        ],
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalAssigned: {
          $sum: { $cond: [{ $eq: ['$assignedTo', new mongoose.Types.ObjectId(workerId)] }, 1, 0] }
        },
        totalResolved: {
          $sum: { $cond: [{ $eq: ['$resolvedBy', new mongoose.Types.ObjectId(workerId)] }, 1, 0] }
        },
        avgResolutionTime: {
          $avg: {
            $cond: [
              { $eq: ['$resolvedBy', new mongoose.Types.ObjectId(workerId)] },
              { $subtract: ['$resolvedAt', '$createdAt'] },
              null
            ]
          }
        }
      }
    }
  ]);
}

async function getWorkerActivityBreakdown(workerId, startDate) {
  return await TrackingHistory.aggregate([
    {
      $match: {
        updatedBy: new mongoose.Types.ObjectId(workerId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$newStatus',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);
}

async function getWorkerQualityMetrics(workerId, startDate) {
  const issuesCreated = await Issue.countDocuments({
    'updates.addedBy': workerId,
    createdAt: { $gte: startDate }
  });

  const packagesHandled = await TrackingHistory.countDocuments({
    updatedBy: workerId,
    timestamp: { $gte: startDate }
  });

  return {
    issuesCreated,
    packagesHandled,
    errorRate: packagesHandled > 0 ? issuesCreated / packagesHandled : 0
  };
}

async function getWorkerShiftAnalysis(workerId, startDate) {
  return await TrackingHistory.aggregate([
    {
      $match: {
        updatedBy: new mongoose.Types.ObjectId(workerId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          hour: { $hour: '$timestamp' }
        },
        activityCount: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        hourlyActivity: {
          $push: {
            hour: '$_id.hour',
            count: '$activityCount'
          }
        },
        totalDailyActivity: { $sum: '$activityCount' }
      }
    },
    { $sort: { _id: -1 } }
  ]);
}