import mongoose from 'mongoose';

const issueSchema = new mongoose.Schema({
  // Issue identification
  issueId: {
    type: String,
    unique: true
  },
  
  // Related mail item
  mailId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mail'
  },
  trackingNumber: String,
  
  // Issue details
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'DELIVERY_DELAY',
      'PACKAGE_DAMAGED', 
      'PACKAGE_LOST',
      'WRONG_RECIPIENT',
      'MISSING_PACKAGE',
      'DELIVERY_ADDRESS_ISSUE',
      'CARRIER_ISSUE',
      'SYSTEM_ERROR',
      'NOTIFICATION_ISSUE',
      'ACCESS_ISSUE',
      'OTHER'
    ]
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED'],
    default: 'OPEN'
  },
  
  // Reporter information
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reporterInfo: {
    name: String,
    email: String,
    phone: String,
    userType: String
  },
  
  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: Date,
  
  // Resolution
  resolverNotes: String,
  resolution: {
    type: String,
    enum: [
      'RESOLVED_DELIVERED',
      'RESOLVED_FOUND',
      'RESOLVED_REPLACED',
      'RESOLVED_REFUNDED',
      'RESOLVED_CARRIER_FAULT',
      'RESOLVED_USER_ERROR',
      'RESOLVED_SYSTEM_FIX',
      'UNRESOLVABLE'
    ]
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date,
  
  // Communication
  updates: [{
    message: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    isInternal: { // Internal notes vs customer-facing updates
      type: Boolean,
      default: false
    },
    attachments: [{
      filename: String,
      url: String,
      type: String
    }]
  }],
  
  // Attachments (photos, documents)
  attachments: [{
    filename: String,
    originalName: String,
    url: String,
    mimeType: String,
    size: Number,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Notifications
  notificationsSent: [{
    type: {
      type: String,
      enum: ['EMAIL', 'SMS', 'PUSH']
    },
    recipient: String,
    sentAt: Date,
    status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'FAILED']
    }
  }],
  
  // SLA tracking
  slaInfo: {
    responseTimeTarget: Number, // hours
    resolutionTimeTarget: Number, // hours
    respondedAt: Date,
    isOverdue: {
      type: Boolean,
      default: false
    }
  },
  
  // Demo flag
  isDemoData: {
    type: Boolean,
    default: false
  },
  
  // Tags for categorization
  tags: [String]
}, {
  timestamps: true
});

// Indexes
issueSchema.index({ issueId: 1 });
issueSchema.index({ mailId: 1 });
issueSchema.index({ trackingNumber: 1 });
issueSchema.index({ reportedBy: 1 });
issueSchema.index({ assignedTo: 1 });
issueSchema.index({ status: 1 });
issueSchema.index({ priority: 1 });
issueSchema.index({ category: 1 });
issueSchema.index({ createdAt: -1 });

// Pre-save middleware to generate issue ID
issueSchema.pre('save', async function(next) {
  if (!this.issueId) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Find the last issue created today
    const lastIssue = await this.constructor.findOne({
      issueId: new RegExp(`^ISS-${dateStr}-`)
    }).sort({ issueId: -1 });
    
    let sequenceNumber = 1;
    if (lastIssue) {
      const lastSequence = parseInt(lastIssue.issueId.split('-')[2]);
      sequenceNumber = lastSequence + 1;
    }
    
    this.issueId = `ISS-${dateStr}-${sequenceNumber.toString().padStart(3, '0')}`;
  }
  next();
});

// Virtual for time since created
issueSchema.virtual('ageInHours').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60));
});

// Virtual for SLA status
issueSchema.virtual('slaStatus').get(function() {
  if (!this.slaInfo?.responseTimeTarget) return 'NO_SLA';
  
  const hoursOpen = this.ageInHours;
  const responseTarget = this.slaInfo.responseTimeTarget;
  const resolutionTarget = this.slaInfo.resolutionTimeTarget;
  
  if (this.status === 'RESOLVED' || this.status === 'CLOSED') {
    return 'RESOLVED';
  }
  
  if (!this.slaInfo.respondedAt && hoursOpen > responseTarget) {
    return 'RESPONSE_OVERDUE';
  }
  
  if (resolutionTarget && hoursOpen > resolutionTarget) {
    return 'RESOLUTION_OVERDUE';
  }
  
  return 'ON_TIME';
});

// Instance methods
issueSchema.methods.addUpdate = function(message, userId, isInternal = false, attachments = []) {
  this.updates.push({
    message,
    addedBy: userId,
    isInternal,
    attachments
  });
  
  return this.save();
};

issueSchema.methods.assignTo = function(assigneeId, assignerId) {
  this.assignedTo = assigneeId;
  this.assignedBy = assignerId;
  this.assignedAt = new Date();
  
  if (!this.slaInfo?.respondedAt) {
    this.slaInfo = {
      ...this.slaInfo,
      respondedAt: new Date()
    };
  }
  
  return this.save();
};

issueSchema.methods.resolve = function(resolution, resolverNotes, resolverId) {
  this.status = 'RESOLVED';
  this.resolution = resolution;
  this.resolverNotes = resolverNotes;
  this.resolvedBy = resolverId;
  this.resolvedAt = new Date();
  
  return this.save();
};

// Static methods
issueSchema.statics.getOpenIssues = function(assignedTo = null) {
  const query = { status: { $in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] } };
  if (assignedTo) query.assignedTo = assignedTo;
  
  return this.find(query)
    .populate('reportedBy', 'firstName lastName email')
    .populate('assignedTo', 'firstName lastName email')
    .populate('mailId', 'trackingNumber type carrier')
    .sort({ priority: -1, createdAt: -1 });
};

issueSchema.statics.getIssueStats = function(dateRange = {}) {
  const match = {};
  if (dateRange.start) match.createdAt = { $gte: dateRange.start };
  if (dateRange.end) match.createdAt = { ...match.createdAt, $lte: dateRange.end };
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalIssues: { $sum: 1 },
        openIssues: { $sum: { $cond: [{ $in: ['$status', ['OPEN', 'IN_PROGRESS']] }, 1, 0] } },
        resolvedIssues: { $sum: { $cond: [{ $eq: ['$status', 'RESOLVED'] }, 1, 0] } },
        avgResolutionTime: {
          $avg: {
            $cond: [
              { $ne: ['$resolvedAt', null] },
              { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] }, // hours
              null
            ]
          }
        }
      }
    }
  ]);
};

export default mongoose.model('Issue', issueSchema);