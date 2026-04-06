import Mail from '../models/Mail.js';
import Issue from '../models/Issue.js';
import User from '../models/User.js';
import TrackingHistory from '../models/TrackingHistory.js';

/**
 * Get dashboard data for recipients
 */
const getRecipientDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get mail summary
    const [
      totalMail,
      pendingMail,
      deliveredMail,
      recentMail,
      openIssues
    ] = await Promise.all([
      Mail.countDocuments({ recipient: userId }),
      Mail.countDocuments({
        recipient: userId,
        status: { $nin: ['DELIVERED', 'PICKED_UP', 'RETURNED_SENDER'] }
      }),
      Mail.countDocuments({
        recipient: userId,
        status: { $in: ['DELIVERED', 'PICKED_UP'] }
      }),
      Mail.find({ recipient: userId })
        .sort({ scanInDate: -1 })
        .limit(10)
        .populate('scannedBy', 'firstName lastName')
        .select('trackingNumber type carrier status scanInDate actualDeliveryDate'),
      Issue.countDocuments({
        reportedBy: userId,
        status: { $in: ['OPEN', 'IN_PROGRESS'] }
      })
    ]);
    
    // Get mail by status breakdown
    const mailByStatus = await Mail.aggregate([
      { $match: { recipient: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get recent activity
    const recentActivity = await TrackingHistory.find({})
      .populate({
        path: 'mailId',
        match: { recipient: userId },
        select: 'trackingNumber type'
      })
      .sort({ timestamp: -1 })
      .limit(10);
    
    const activity = recentActivity
      .filter(item => item.mailId) // Only include items where the mail belongs to user
      .map(item => ({
        type: 'STATUS_UPDATE',
        timestamp: item.timestamp,
        details: `${item.mailId.trackingNumber} status changed to ${item.newStatus}`,
        mailType: item.mailId.type
      }));
    
    res.json({
      success: true,
      data: {
        summary: {
          totalMail,
          pendingMail,
          deliveredMail,
          openIssues
        },
        mailByStatus,
        recentMail,
        recentActivity: activity
      }
    });
    
  } catch (error) {
    console.error('Get recipient dashboard error:', error);
    next(error);
  }
};

/**
 * Get dashboard data for deliverers
 */
const getDelivererDashboard = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Build query filter for demo users
    const demoFilter = req.user.isDemoUser ? { isDemoData: true } : {};
    
    // Get mail statistics
    const [
      totalMailToday,
      totalMailThisMonth,
      pendingMail,
      overdueMail,
      recentScans,
      statusBreakdown,
      carrierBreakdown
    ] = await Promise.all([
      Mail.countDocuments({
        ...demoFilter,
        scanInDate: { $gte: today, $lt: tomorrow }
      }),
      Mail.countDocuments({
        ...demoFilter,
        scanInDate: { $gte: thirtyDaysAgo }
      }),
      Mail.countDocuments({
        ...demoFilter,
        status: { $nin: ['DELIVERED', 'PICKED_UP', 'RETURNED_SENDER'] }
      }),
      Mail.countDocuments({
        ...demoFilter,
        scanInDate: { $lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        status: { $nin: ['DELIVERED', 'PICKED_UP', 'RETURNED_SENDER'] }
      }),
      Mail.find(demoFilter)
        .sort({ scanInDate: -1 })
        .limit(10)
        .populate('recipient', 'firstName lastName')
        .populate('scannedBy', 'firstName lastName')
        .select('trackingNumber type carrier status scanInDate recipientName'),
      Mail.aggregate([
        { $match: demoFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      Mail.aggregate([
        { $match: demoFilter },
        {
          $group: {
            _id: '$carrier',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);
    
    // Get issue statistics
    const [
      openIssues,
      assignedIssues,
      recentIssues
    ] = await Promise.all([
      Issue.countDocuments({
        ...demoFilter,
        status: { $in: ['OPEN', 'IN_PROGRESS'] }
      }),
      Issue.countDocuments({
        ...demoFilter,
        assignedTo: req.user.id,
        status: { $in: ['OPEN', 'IN_PROGRESS'] }
      }),
      Issue.find(demoFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('reportedBy', 'firstName lastName')
        .select('issueId title category priority status createdAt')
    ]);
    
    // Get user's recent activity
    let userActivity = [];
    if (!req.user.isDemoUser) {
      userActivity = await TrackingHistory.getUserActivity(req.user.id, 10);
    }
    
    // Performance metrics for the user
    const userMetrics = req.user.isDemoUser ? {
      mailScannedToday: Math.floor(Math.random() * 20) + 5,
      statusUpdatesToday: Math.floor(Math.random() * 15) + 3,
      avgProcessingTime: Math.floor(Math.random() * 30) + 15 // minutes
    } : await getUserPerformanceMetrics(req.user.id, today, tomorrow);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalMailToday,
          totalMailThisMonth,
          pendingMail,
          overdueMail,
          openIssues,
          assignedIssues
        },
        statusBreakdown,
        carrierBreakdown,
        recentScans,
        recentIssues,
        userMetrics,
        recentActivity: userActivity.slice(0, 10)
      }
    });
    
  } catch (error) {
    console.error('Get deliverer dashboard error:', error);
    next(error);
  }
};

/**
 * Get admin dashboard with system-wide statistics
 */
const getAdminDashboard = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setMonth(thisMonth.getMonth() - 1);
    
    // System-wide statistics
    const [
      totalUsers,
      activeRecipients,
      activeDeliverers,
      totalMailThisWeek,
      avgDeliveryTime,
      systemHealth
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ userType: 'recipient', isActive: true }),
      User.countDocuments({ userType: 'deliverer', isActive: true }),
      Mail.countDocuments({ scanInDate: { $gte: thisWeek } }),
      Mail.aggregate([
        {
          $match: {
            actualDeliveryDate: { $exists: true },
            scanInDate: { $gte: thisMonth }
          }
        },
        {
          $group: {
            _id: null,
            avgDays: {
              $avg: {
                $divide: [
                  { $subtract: ['$actualDeliveryDate', '$scanInDate'] },
                  86400000
                ]
              }
            }
          }
        }
      ]),
      getSystemHealthMetrics()
    ]);
    
    // Performance trends
    const performanceTrends = await getPerformanceTrends();
    
    // Top performers
    const topPerformers = await getTopPerformingDeliverers();
    
    // Issue trends
    const issueTrends = await Issue.aggregate([
      {
        $match: {
          createdAt: { $gte: thisMonth }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            category: '$category'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          activeRecipients,
          activeDeliverers,
          totalMailThisWeek,
          avgDeliveryTimeDays: avgDeliveryTime[0]?.avgDays || 0
        },
        systemHealth,
        performanceTrends,
        topPerformers,
        issueTrends
      }
    });
    
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    next(error);
  }
};

/**
 * Get general analytics data
 */
const getAnalytics = async (req, res, next) => {
  try {
    const { dateFrom, dateTo, granularity = 'day' } = req.query;
    
    let startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let endDate = dateTo ? new Date(dateTo) : new Date();
    
    // Build demo filter
    const demoFilter = req.user.isDemoUser ? { isDemoData: true } : {};
    
    // Mail volume over time
    const mailVolumeData = await Mail.aggregate([
      {
        $match: {
          ...demoFilter,
          scanInDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { 
              $dateToString: { 
                format: granularity === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d', 
                date: '$scanInDate' 
              }
            },
            carrier: '$carrier'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    // Delivery performance
    const deliveryPerformance = await Mail.aggregate([
      {
        $match: {
          ...demoFilter,
          actualDeliveryDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$actualDeliveryDate' } }
          },
          avgDeliveryTime: {
            $avg: {
              $divide: [
                { $subtract: ['$actualDeliveryDate', '$scanInDate'] },
                86400000 // Convert to days
              ]
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        mailVolumeData,
        deliveryPerformance,
        dateRange: { startDate, endDate }
      }
    });
    
  } catch (error) {
    console.error('Get analytics error:', error);
    next(error);
  }
};

// Helper functions
async function getUserPerformanceMetrics(userId, startDate, endDate) {
  const [mailScanned, statusUpdates] = await Promise.all([
    Mail.countDocuments({
      scannedBy: userId,
      scanInDate: { $gte: startDate, $lt: endDate }
    }),
    Mail.countDocuments({
      lastUpdatedBy: userId,
      lastStatusUpdate: { $gte: startDate, $lt: endDate }
    })
  ]);
  
  // Calculate average processing time (time between scan and first status update)
  const processingTimes = await TrackingHistory.aggregate([
    {
      $match: {
        updatedBy: userId,
        timestamp: { $gte: startDate, $lt: endDate }
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
    {
      $unwind: '$mail'
    },
    {
      $group: {
        _id: '$mailId',
        firstUpdate: { $min: '$timestamp' },
        scanDate: { $first: '$mail.scanInDate' }
      }
    },
    {
      $project: {
        processingTimeMinutes: {
          $divide: [
            { $subtract: ['$firstUpdate', '$scanDate'] },
            60000 // Convert to minutes
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        avgProcessingTime: { $avg: '$processingTimeMinutes' }
      }
    }
  ]);
  
  return {
    mailScannedToday: mailScanned,
    statusUpdatesToday: statusUpdates,
    avgProcessingTime: processingTimes[0]?.avgProcessingTime || 0
  };
}

async function getSystemHealthMetrics() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  const [
    overdueItems,
    unprocessedItems,
    errorRate,
    activeUsers
  ] = await Promise.all([
    Mail.countDocuments({
      scanInDate: { $lte: oneWeekAgo },
      status: { $nin: ['DELIVERED', 'PICKED_UP', 'RETURNED_SENDER'] }
    }),
    Mail.countDocuments({
      scanInDate: { $lte: oneDayAgo },
      status: 'SCANNED_IN'
    }),
    Issue.countDocuments({
      createdAt: { $gte: oneDayAgo },
      category: { $in: ['SYSTEM_ERROR', 'CARRIER_ISSUE'] }
    }),
    User.countDocuments({
      lastLogin: { $gte: oneDayAgo },
      isActive: true
    })
  ]);
  
  return {
    overdueItems,
    unprocessedItems,
    errorRate,
    activeUsers,
    healthScore: Math.max(0, 100 - (overdueItems * 2) - (unprocessedItems) - (errorRate * 5))
  };
}

async function getPerformanceTrends() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  return Mail.aggregate([
    {
      $match: {
        scanInDate: { $gte: sevenDaysAgo }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$scanInDate' } },
        totalScanned: { $sum: 1 },
        delivered: {
          $sum: {
            $cond: [
              { $in: ['$status', ['DELIVERED', 'PICKED_UP']] },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function getTopPerformingDeliverers() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  return User.aggregate([
    {
      $match: {
        userType: 'deliverer',
        isActive: true
      }
    },
    {
      $lookup: {
        from: 'mails',
        localField: '_id',
        foreignField: 'scannedBy',
        as: 'scannedMail',
        pipeline: [
          { $match: { scanInDate: { $gte: thirtyDaysAgo } } }
        ]
      }
    },
    {
      $lookup: {
        from: 'mails',
        localField: '_id',
        foreignField: 'lastUpdatedBy',
        as: 'updatedMail',
        pipeline: [
          { $match: { lastStatusUpdate: { $gte: thirtyDaysAgo } } }
        ]
      }
    },
    {
      $project: {
        firstName: 1,
        lastName: 1,
        email: 1,
        'delivererInfo.level': 1,
        scannedCount: { $size: '$scannedMail' },
        updatedCount: { $size: '$updatedMail' }
      }
    },
    {
      $addFields: {
        totalActivity: { $add: ['$scannedCount', '$updatedCount'] }
      }
    },
    { $sort: { totalActivity: -1 } },
    { $limit: 10 }
  ]);
}

export {
  getRecipientDashboard,
  getDelivererDashboard,
  getAdminDashboard,
  getAnalytics
};