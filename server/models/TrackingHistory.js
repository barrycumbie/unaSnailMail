import mongoose from 'mongoose';

const trackingHistorySchema = new mongoose.Schema({
  mailId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mail',
    required: true
  },
  trackingNumber: {
    type: String,
    required: true
  },
  
  // Status change information
  previousStatus: String,
  newStatus: {
    type: String,
    required: true
  },
  
  // Who made the change
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updaterInfo: {
    name: String,
    email: String,
    userType: String,
    level: Number // For deliverers
  },
  
  // Change details
  reason: String,
  notes: String,
  
  // Location information at time of update
  location: {
    zone: String,
    shelf: String,
    bin: String
  },
  
  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now
  },
  
  // Additional context
  metadata: {
    ipAddress: String,
    userAgent: String,
    scannerDevice: String,
    batchId: String // If part of a batch operation
  },
  
  // For demo data
  isDemoData: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
trackingHistorySchema.index({ mailId: 1, timestamp: -1 });
trackingHistorySchema.index({ trackingNumber: 1, timestamp: -1 });
trackingHistorySchema.index({ updatedBy: 1 });
trackingHistorySchema.index({ newStatus: 1 });
trackingHistorySchema.index({ timestamp: -1 });

// Static methods
trackingHistorySchema.statics.createEntry = function(mailItem, previousStatus, newStatus, updatedBy, options = {}) {
  return this.create({
    mailId: mailItem._id,
    trackingNumber: mailItem.trackingNumber,
    previousStatus,
    newStatus,
    updatedBy: updatedBy._id,
    updaterInfo: {
      name: `${updatedBy.firstName} ${updatedBy.lastName}`,
      email: updatedBy.email,
      userType: updatedBy.userType,
      level: updatedBy.delivererInfo?.level
    },
    reason: options.reason,
    notes: options.notes,
    location: options.location || mailItem.currentLocation,
    metadata: options.metadata || {},
    isDemoData: mailItem.isDemoData
  });
};

trackingHistorySchema.statics.getMailHistory = function(mailId) {
  return this.find({ mailId })
    .populate('updatedBy', 'firstName lastName email userType')
    .sort({ timestamp: -1 });
};

trackingHistorySchema.statics.getUserActivity = function(userId, limit = 50) {
  return this.find({ updatedBy: userId })
    .populate('mailId', 'trackingNumber type carrier')
    .sort({ timestamp: -1 })
    .limit(limit);
};

export default mongoose.model('TrackingHistory', trackingHistorySchema);