import mongoose from 'mongoose';

const mailSchema = new mongoose.Schema({
  // Tracking Information
  trackingNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  internalTrackingId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Carrier Information
  carrier: {
    type: String,
    required: true,
    enum: ['UPS', 'USPS', 'FEDEX', 'AMAZON', 'DHL', 'INTERNAL', 'OTHER']
  },
  carrierTrackingUrl: String,
  
  // Mail/Package Details
  type: {
    type: String,
    required: true,
    enum: ['LETTER', 'PACKAGE', 'CERTIFIED_MAIL', 'REGISTERED_MAIL', 'EXPRESS', 'PRIORITY']
  },
  size: {
    type: String,
    enum: ['SMALL', 'MEDIUM', 'LARGE', 'OVERSIZED']
  },
  weight: Number, // in pounds
  
  // Recipient Information
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientName: String,
  recipientEmail: String,
  
  // Delivery Address (as scanned from label)
  deliveryAddress: {
    name: String,
    building: String,
    room: String,
    department: String,
    mailBox: String,
    fullAddress: String
  },
  
  // Sender Information
  senderName: String,
  senderAddress: String,
  returnAddress: String,
  
  // Status Tracking
  status: {
    type: String,
    required: true,
    enum: [
      'SCANNED_IN',      // Just received and scanned
      'PROCESSING',      // Being sorted/processed
      'READY_PICKUP',    // Ready for recipient pickup
      'OUT_DELIVERY',    // Out for delivery
      'DELIVERED',       // Successfully delivered
      'PICKUP_READY',    // At pickup location
      'PICKED_UP',       // Recipient has picked up
      'RETURNED_SENDER', // Returned to sender
      'EXCEPTION',       // Problem occurred
      'LOST',           // Item is lost
      'DAMAGED'         // Item is damaged
    ],
    default: 'SCANNED_IN'
  },
  
  // Location tracking within facility
  currentLocation: {
    zone: String,    // e.g., "SORTING", "PICKUP_AREA", "STORAGE"
    shelf: String,
    bin: String,
    notes: String
  },
  
  // Dates & Times
  scanInDate: {
    type: Date,
    default: Date.now
  },
  expectedDeliveryDate: Date,
  actualDeliveryDate: Date,
  lastStatusUpdate: {
    type: Date,
    default: Date.now
  },
  
  // Staff Information
  scannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deliveredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Special Handling
  requiresSignature: {
    type: Boolean,
    default: false
  },
  isFragile: {
    type: Boolean,
    default: false
  },
  isConfidential: {
    type: Boolean,
    default: false
  },
  specialInstructions: String,
  
  // Notifications
  recipientNotified: {
    type: Boolean,
    default: false
  },
  notificationsSent: [{
    type: {
      type: String,
      enum: ['EMAIL', 'SMS', 'PUSH']
    },
    sentAt: Date,
    status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'FAILED']
    }
  }],
  
  // Images & Documentation
  photos: [{
    url: String,
    type: {
      type: String,
      enum: ['LABEL', 'PACKAGE', 'DAMAGE', 'SIGNATURE']
    },
    uploadedAt: Date,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Demo data flag
  isDemoData: {
    type: Boolean,
    default: false
  },
  
  // Additional metadata
  metadata: {
    scannerInfo: String,
    barcodeFormat: String,
    originalCarrierData: mongoose.Schema.Types.Mixed
  },
  
  // Internal Package specific fields
  internalPackage: {
    packageType: {
      type: String,
      enum: ['CAMPUS_MAIL', 'INTER_DEPT', 'SPECIAL', 'RUSH', 'FREIGHT', 'CONFIDENTIAL', 'LABORATORY', 'MAINTENANCE', 'STUDENT', 'FACULTY']
    },
    fromLocation: {
      code: String,
      name: String
    },
    toLocation: {
      code: String, 
      name: String
    },
    priority: {
      level: Number,
      name: String,
      deliveryTime: String
    },
    department: String,
    generatedAt: Date,
    estimatedDelivery: Date,
    qrCode: String,        // Base64 encoded QR code
    labelGenerated: {
      type: Boolean,
      default: false
    },
    labelGeneratedAt: Date,
    deliveryRoute: {
      distance: Number,
      estimatedTime: Number,
      stops: [{
        location: String,
        estimatedTime: Number,
        purpose: String
      }]
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
mailSchema.index({ trackingNumber: 1 });
mailSchema.index({ internalTrackingId: 1 });
mailSchema.index({ recipient: 1 });
mailSchema.index({ status: 1 });
mailSchema.index({ carrier: 1 });
mailSchema.index({ scanInDate: -1 });
mailSchema.index({ 'recipientEmail': 1 });
mailSchema.index({ 'deliveryAddress.building': 1 });
mailSchema.index({ 'deliveryAddress.room': 1 });

// Virtual for days since received
mailSchema.virtual('daysInSystem').get(function() {
  return Math.floor((new Date() - this.scanInDate) / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue (more than 7 days and not delivered)
mailSchema.virtual('isOverdue').get(function() {
  return this.daysInSystem > 7 && !['DELIVERED', 'PICKED_UP', 'RETURNED_SENDER'].includes(this.status);
});

// Instance methods
mailSchema.methods.updateStatus = function(newStatus, updatedBy, notes = '') {
  this.status = newStatus;
  this.lastStatusUpdate = new Date();
  this.lastUpdatedBy = updatedBy;
  
  if (newStatus === 'DELIVERED' || newStatus === 'PICKED_UP') {
    this.actualDeliveryDate = new Date();
    this.deliveredBy = updatedBy;
  }
  
  // Add to tracking history (handled by TrackingHistory model)
  return this.save();
};

mailSchema.methods.addPhoto = function(photoUrl, photoType, uploadedBy) {
  this.photos.push({
    url: photoUrl,
    type: photoType,
    uploadedAt: new Date(),
    uploadedBy: uploadedBy
  });
  return this.save();
};

// Static methods for analytics
mailSchema.statics.getStatusCounts = function(dateRange = {}) {
  const match = {};
  if (dateRange.start) match.scanInDate = { $gte: dateRange.start };
  if (dateRange.end) match.scanInDate = { ...match.scanInDate, $lte: dateRange.end };
  
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
};

mailSchema.statics.getCarrierStats = function() {
  return this.aggregate([
    { $group: { 
      _id: '$carrier', 
      count: { $sum: 1 },
      avgDaysToDelivery: { 
        $avg: { 
          $divide: [
            { $subtract: ['$actualDeliveryDate', '$scanInDate'] },
            86400000 // Convert to days
          ]
        }
      }
    }},
    { $sort: { count: -1 } }
  ]);
};

export default mongoose.model('Mail', mailSchema);