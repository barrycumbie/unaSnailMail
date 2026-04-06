import Mail from '../models/Mail.js';
import TrackingHistory from '../models/TrackingHistory.js';
import User from '../models/User.js';
import { v4 as uuidv4 } from 'uuid';
import { 
  validateMailScan, 
  validateStatusUpdate, 
  validateSearchQuery,
  formatValidationError 
} from '../utils/validation.js';
import CarrierManager from '../services/CarrierManager.js';
import InternalPackageService from '../services/InternalPackageService.js';

/**
 * Scan new mail/package into system
 */
export const scanMail = async (req, res, next) => {
  try {
    const { error, value } = validateMailScan(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const mailData = value;
    
    // Check if tracking number already exists
    const existingMail = await Mail.findOne({ 
      trackingNumber: mailData.trackingNumber 
    });
    
    if (existingMail) {
      return res.status(409).json({
        success: false,
        message: 'Mail item with this tracking number already exists',
        data: {
          existingItem: {
            id: existingMail._id,
            trackingNumber: existingMail.trackingNumber,
            status: existingMail.status,
            scanInDate: existingMail.scanInDate
          }
        }
      });
    }
    
    // Try to find recipient by email or name
    let recipient = null;
    if (mailData.recipientEmail) {
      recipient = await User.findOne({ 
        email: mailData.recipientEmail,
        userType: 'recipient' 
      });
    }
    
    // If no recipient found, we'll create a placeholder entry
    if (!recipient && mailData.recipientName) {
      // For now, we'll store the name and allow manual matching later
      console.log(`No recipient found for ${mailData.recipientName}, storing as unmatched`);
    }
    
    // Generate internal tracking ID
    const internalTrackingId = `UNA-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Create mail item
    const newMail = new Mail({
      ...mailData,
      internalTrackingId,
      recipient: recipient?._id,
      scannedBy: req.user.id,
      isDemoData: req.user.isDemoUser || false,
      status: 'SCANNED_IN'
    });
    
    await newMail.save();
    
    // Create tracking history entry
    await TrackingHistory.createEntry(
      newMail, 
      null, 
      'SCANNED_IN', 
      { _id: req.user.id, ...req.user }, 
      {
        reason: 'Initial scan',
        notes: 'Mail item scanned into system',
        metadata: {
          scannerDevice: req.headers['user-agent'],
          ipAddress: req.ip
        }
      }
    );
    
    // Populate the saved mail item for response
    const populatedMail = await Mail.findById(newMail._id)
      .populate('recipient', 'firstName lastName email')
      .populate('scannedBy', 'firstName lastName email');
    
    res.status(201).json({
      success: true,
      message: 'Mail item scanned successfully',
      data: {
        mail: populatedMail
      }
    });
    
  } catch (error) {
    console.error('Scan mail error:', error);
    next(error);
  }
};

/**
 * Update mail status
 */
export const updateStatus = async (req, res, next) => {
  try {
    const { mailId } = req.params;
    const { error, value } = validateStatusUpdate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const { status, notes, location, notifyRecipient } = value;
    
    // Find mail item
    const mail = await Mail.findById(mailId);
    
    if (!mail) {
      return res.status(404).json({
        success: false,
        message: 'Mail item not found'
      });
    }
    
    // Store previous status for history
    const previousStatus = mail.status;
    
    // Update mail item
    mail.status = status;
    mail.lastStatusUpdate = new Date();
    mail.lastUpdatedBy = req.user.id;
    
    if (location) {
      mail.currentLocation = { ...mail.currentLocation, ...location };
    }
    
    if (status === 'DELIVERED' || status === 'PICKED_UP') {
      mail.actualDeliveryDate = new Date();
      mail.deliveredBy = req.user.id;
    }
    
    await mail.save();
    
    // Create tracking history entry
    await TrackingHistory.createEntry(
      mail,
      previousStatus,
      status,
      { _id: req.user.id, ...req.user },
      {
        reason: 'Status update',
        notes: notes || `Status changed to ${status}`,
        location: location || mail.currentLocation,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent']
        }
      }
    );
    
    // TODO: Send notifications if notifyRecipient is true
    
    const updatedMail = await Mail.findById(mailId)
      .populate('recipient', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email');
    
    res.json({
      success: true,
      message: 'Status updated successfully',
      data: {
        mail: updatedMail
      }
    });
    
  } catch (error) {
    console.error('Update status error:', error);
    next(error);
  }
};

/**
 * Get mail item details
 */
export const getMailDetails = async (req, res, next) => {
  try {
    const { mailId } = req.params;
    
    const mail = await Mail.findById(mailId)
      .populate('recipient', 'firstName lastName email recipientInfo')
      .populate('scannedBy', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName email')
      .populate('deliveredBy', 'firstName lastName email');
    
    if (!mail) {
      return res.status(404).json({
        success: false,
        message: 'Mail item not found'
      });
    }
    
    // Check permissions - recipients can only see their own mail
    if (req.user.userType === 'recipient') {
      if (!mail.recipient || mail.recipient._id.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own mail.'
        });
      }
    }
    
    // Get tracking history
    const history = await TrackingHistory.getMailHistory(mailId);
    
    res.json({
      success: true,
      data: {
        mail,
        history
      }
    });
    
  } catch (error) {
    console.error('Get mail details error:', error);
    next(error);
  }
};

/**
 * Search mail items
 */
export const searchMail = async (req, res, next) => {
  try {
    const { error, value } = validateSearchQuery(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: formatValidationError(error)
      });
    }
    
    const { q, status, carrier, type, dateFrom, dateTo, page, limit, sortBy, sortOrder } = value;
    
    // Build query
    let query = {};
    
    // Full-text search
    if (q) {
      query.$or = [
        { trackingNumber: { $regex: q, $options: 'i' } },
        { internalTrackingId: { $regex: q, $options: 'i' } },
        { recipientName: { $regex: q, $options: 'i' } },
        { 'deliveryAddress.name': { $regex: q, $options: 'i' } },
        { 'deliveryAddress.building': { $regex: q, $options: 'i' } },
        { 'deliveryAddress.room': { $regex: q, $options: 'i' } }
      ];
    }
    
    // Filter by status
    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }
    
    // Filter by carrier
    if (carrier) {
      query.carrier = Array.isArray(carrier) ? { $in: carrier } : carrier;
    }
    
    // Filter by type
    if (type) {
      query.type = Array.isArray(type) ? { $in: type } : type;
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.scanInDate = {};
      if (dateFrom) query.scanInDate.$gte = new Date(dateFrom);
      if (dateTo) query.scanInDate.$lte = new Date(dateTo);
    }
    
    // For recipients, only show their own mail
    if (req.user.userType === 'recipient') {
      query.recipient = req.user.id;
    }
    
    // For demo users, only show demo data
    if (req.user.isDemoUser) {
      query.isDemoData = true;
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    const [mailItems, totalCount] = await Promise.all([
      Mail.find(query)
        .populate('recipient', 'firstName lastName email')
        .populate('scannedBy', 'firstName lastName email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Mail.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: {
        mailItems,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNext: page < Math.ceil(totalCount / limit),
          hasPrev: page > 1
        }
      }
    });
    
  } catch (error) {
    console.error('Search mail error:', error);
    next(error);
  }
};

/**
 * Track by tracking number (public endpoint)
 */
export const trackByNumber = async (req, res, next) => {
  try {
    const { trackingNumber } = req.params;
    
    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number is required'
      });
    }
    
    const mail = await Mail.findOne({ 
      $or: [
        { trackingNumber: trackingNumber.toUpperCase() },
        { internalTrackingId: trackingNumber.toUpperCase() }
      ]
    }).populate('recipient', 'firstName lastName');
    
    if (!mail) {
      return res.status(404).json({
        success: false,
        message: 'No mail item found with this tracking number'
      });
    }
    
    // Get recent tracking history (last 10 entries)
    const history = await TrackingHistory.find({ mailId: mail._id })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('newStatus timestamp notes');
    
    // Return limited information for public tracking
    res.json({
      success: true,
      data: {
        trackingNumber: mail.trackingNumber,
        internalTrackingId: mail.internalTrackingId,
        type: mail.type,
        status: mail.status,
        scanInDate: mail.scanInDate,
        actualDeliveryDate: mail.actualDeliveryDate,
        carrier: mail.carrier,
        recipientName: mail.recipientName,
        history: history.map(h => ({
          status: h.newStatus,
          timestamp: h.timestamp,
          notes: h.notes
        }))
      }
    });
    
  } catch (error) {
    console.error('Track by number error:', error);
    next(error);
  }
};

/**
 * Get mail statistics
 */
export const getMailStats = async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;
    
    // Date range filter
    let dateFilter = {};
    if (dateFrom || dateTo) {
      dateFilter.scanInDate = {};
      if (dateFrom) dateFilter.scanInDate.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.scanInDate.$lte = new Date(dateTo);
    }
    
    // For demo users, only show demo stats
    if (req.user.isDemoUser) {
      dateFilter.isDemoData = true;
    }
    
    const [
      statusCounts,
      carrierStats,
      totalCount,
      deliveredToday,
      avgDeliveryTime
    ] = await Promise.all([
      Mail.getStatusCounts(dateFrom && dateTo ? { start: new Date(dateFrom), end: new Date(dateTo) } : {}),
      Mail.getCarrierStats(),
      Mail.countDocuments(dateFilter),
      Mail.countDocuments({
        ...dateFilter,
        actualDeliveryDate: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999))
        }
      }),
      Mail.aggregate([
        {
          $match: {
            ...dateFilter,
            actualDeliveryDate: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgDays: {
              $avg: {
                $divide: [
                  { $subtract: ['$actualDeliveryDate', '$scanInDate'] },
                  86400000 // Convert to days
                ]
              }
            }
          }
        }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalItems: totalCount,
          deliveredToday,
          avgDeliveryTimeDays: avgDeliveryTime[0]?.avgDays || 0
        },
        statusCounts,
        carrierStats
      }
    });
    
  } catch (error) {
    console.error('Get mail stats error:', error);
    next(error);
  }
};

/**
 * Bulk update mail status
 */
export const bulkUpdateStatus = async (req, res, next) => {
  try {
    const { mailIds, status, notes } = req.body;
    
    if (!Array.isArray(mailIds) || mailIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Mail IDs array is required'
      });
    }
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const validStatuses = [
      'SCANNED_IN', 'PROCESSING', 'READY_PICKUP', 'OUT_DELIVERY',
      'DELIVERED', 'PICKUP_READY', 'PICKED_UP', 'RETURNED_SENDER',
      'EXCEPTION', 'LOST', 'DAMAGED'
    ];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }
    
    // Find mail items
    const mailItems = await Mail.find({
      _id: { $in: mailIds }
    });
    
    if (mailItems.length !== mailIds.length) {
      return res.status(404).json({
        success: false,
        message: 'Some mail items not found'
      });
    }
    
    const updates = [];
    const historyEntries = [];
    
    for (const mail of mailItems) {
      const previousStatus = mail.status;
      
      // Update mail
      const updateData = {
        status,
        lastStatusUpdate: new Date(),
        lastUpdatedBy: req.user.id
      };
      
      if (status === 'DELIVERED' || status === 'PICKED_UP') {
        updateData.actualDeliveryDate = new Date();
        updateData.deliveredBy = req.user.id;
      }
      
      updates.push({
        updateOne: {
          filter: { _id: mail._id },
          update: updateData
        }
      });
      
      // Create history entry
      historyEntries.push({
        mailId: mail._id,
        trackingNumber: mail.trackingNumber,
        previousStatus,
        newStatus: status,
        updatedBy: req.user.id,
        updaterInfo: {
          name: `${req.user.firstName} ${req.user.lastName}`,
          email: req.user.email,
          userType: req.user.userType,
          level: req.user.level
        },
        reason: 'Bulk update',
        notes: notes || `Bulk status change to ${status}`,
        location: mail.currentLocation,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          batchId: uuidv4()
        },
        isDemoData: mail.isDemoData
      });
    }
    
    // Execute bulk operations
    await Promise.all([
      Mail.bulkWrite(updates),
      TrackingHistory.insertMany(historyEntries)
    ]);
    
    res.json({
      success: true,
      message: `Successfully updated ${mailItems.length} mail items`,
      data: {
        updatedCount: mailItems.length,
        status
      }
    });
    
  } catch (error) {
    console.error('Bulk update status error:', error);
    next(error);
  }
};

/**
 * Track package using carrier APIs
 */
export const trackWithCarrier = async (req, res, next) => {
  try {
    const { trackingNumber } = req.params;
    const { carrier } = req.query;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number is required'
      });
    }

    // Track using carrier manager
    const trackingResult = await CarrierManager.trackPackage(trackingNumber, carrier);

    // Update our database if we found tracking information
    if (trackingResult.success) {
      try {
        const mail = await Mail.findOne({ trackingNumber });
        if (mail) {
          await CarrierManager.updateMailTracking(mail._id, trackingResult);
        }
      } catch (updateError) {
        console.warn('Failed to update database with tracking info:', updateError);
        // Don't fail the request if DB update fails
      }
    }

    res.json({
      success: true,
      data: trackingResult
    });

  } catch (error) {
    console.error('Carrier tracking error:', error);
    next(error);
  }
};

/**
 * Validate tracking number format for specific carrier
 */
export const validateTrackingNumber = async (req, res, next) => {
  try {
    const { trackingNumber, carrier } = req.query;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number is required'
      });
    }

    if (!carrier) {
      // Auto-detect carrier
      const detectedCarrier = CarrierManager.detectCarrier(trackingNumber);
      return res.json({
        success: true,
        data: {
          trackingNumber,
          detectedCarrier,
          isValid: !!detectedCarrier,
          supportedCarriers: CarrierManager.getSupportedCarriers().map(c => c.name)
        }
      });
    }

    // Validate for specific carrier
    const isValid = CarrierManager.validateTrackingNumber(trackingNumber, carrier);
    const trackingUrl = isValid ? CarrierManager.getTrackingUrl(trackingNumber, carrier) : null;

    res.json({
      success: true,
      data: {
        trackingNumber,
        carrier: carrier.toUpperCase(),
        isValid,
        trackingUrl
      }
    });

  } catch (error) {
    console.error('Tracking validation error:', error);
    next(error);
  }
};

/**
 * Refresh tracking information for all active shipments
 */
export const refreshAllTracking = async (req, res, next) => {
  try {
    // Check permission - only supervisors and admins can refresh all tracking
    if (req.user.level < 2) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to refresh all tracking data'
      });
    }

    const refreshResult = await CarrierManager.refreshAllTracking();

    res.json({
      success: true,
      message: `Refreshed tracking for ${refreshResult.total} shipments`,
      data: refreshResult
    });

  } catch (error) {
    console.error('Tracking refresh error:', error);
    next(error);
  }
};

/**
 * Get carrier service status and capabilities
 */
export const getCarrierStatus = async (req, res, next) => {
  try {
    const carrierStatus = await CarrierManager.getCarrierStatus();
    const supportedCarriers = CarrierManager.getSupportedCarriers();

    res.json({
      success: true,
      data: {
        carriers: supportedCarriers,
        status: carrierStatus,
        totalSupported: supportedCarriers.length,
        availableServices: Object.values(carrierStatus).filter(s => s.available).length
      }
    });

  } catch (error) {
    console.error('Carrier status error:', error);
    next(error);
  }
};

/**
 * Bulk track multiple packages
 */
export const bulkTrackPackages = async (req, res, next) => {
  try {
    const { packages } = req.body;

    if (!Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Packages array is required'
      });
    }

    if (packages.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 50 packages can be tracked at once'
      });
    }

    // Validate package format
    for (const pkg of packages) {
      if (!pkg.trackingNumber) {
        return res.status(400).json({
          success: false,
          message: 'Each package must have a trackingNumber'
        });
      }
    }

    const trackingResults = await CarrierManager.bulkTrackPackages(packages);

    // Update database for successful tracking results
    const updatePromises = trackingResults
      .filter(result => result.success)
      .map(async (result) => {
        try {
          const mail = await Mail.findOne({ trackingNumber: result.trackingNumber });
          if (mail) {
            await CarrierManager.updateMailTracking(mail._id, result);
          }
        } catch (error) {
          console.warn(`Failed to update DB for ${result.trackingNumber}:`, error);
        }
      });

    await Promise.all(updatePromises);

    const summary = {
      total: trackingResults.length,
      successful: trackingResults.filter(r => r.success).length,
      failed: trackingResults.filter(r => !r.success).length
    };

    res.json({
      success: true,
      message: `Bulk tracking completed: ${summary.successful}/${summary.total} successful`,
      data: {
        results: trackingResults,
        summary
      }
    });

  } catch (error) {
    console.error('Bulk tracking error:', error);
    next(error);
  }
};

/**
 * Generate internal tracking number and create package
 */
export const generateInternalPackage = async (req, res, next) => {
  try {
    const {
      type = 'CAMPUS_MAIL',
      fromLocation = 'MAIN',
      toLocation = 'MAIN',
      priority = 'STANDARD',
      department = null,
      isConfidential = false,
      recipientName,
      recipientEmail,
      senderName,
      deliveryAddress = {},
      packageDetails = {},
      specialInstructions = ''
    } = req.body;

    // Validate required fields
    if (!recipientName) {
      return res.status(400).json({
        success: false,
        message: 'Recipient name is required'
      });
    }

    // Generate internal tracking number
    const trackingData = InternalPackageService.generateTrackingNumber({
      type,
      fromLocation,
      toLocation,
      priority,
      department,
      isConfidential
    });

    // Try to find recipient user
    let recipient = null;
    if (recipientEmail) {
      recipient = await User.findOne({ email: recipientEmail });
    }

    // Create mail entry
    const mailData = {
      trackingNumber: trackingData.trackingNumber,
      internalTrackingId: trackingData.trackingNumber, // Same for internal packages
      carrier: 'INTERNAL',
      type: packageDetails.type || 'PACKAGE',
      size: packageDetails.size,
      weight: packageDetails.weight,
      recipient: recipient?._id,
      recipientName,
      recipientEmail,
      senderName,
      deliveryAddress: {
        name: recipientName,
        building: deliveryAddress.building,
        room: deliveryAddress.room,
        department: deliveryAddress.department || department,
        mailBox: deliveryAddress.mailBox,
        fullAddress: deliveryAddress.fullAddress
      },
      status: 'SCANNED_IN',
      isConfidential,
      specialInstructions,
      scannedBy: req.user.id,
      lastUpdatedBy: req.user.id,
      internalPackage: trackingData.metadata,
      isDemoData: req.user.isLocalhost || req.user.isDemoUser
    };

    const mail = new Mail(mailData);
    await mail.save();

    // Generate QR code
    const qrCode = await InternalPackageService.generateQRCode(trackingData.trackingNumber);
    mail.internalPackage.qrCode = qrCode;
    await mail.save();

    // Create initial tracking history
    const historyEntry = new TrackingHistory({
      mailId: mail._id,
      oldStatus: null,
      newStatus: 'SCANNED_IN',
      changedBy: req.user.id,
      notes: `Internal package created - ${trackingData.metadata.type}`,
      timestamp: new Date()
    });
    await historyEntry.save();

    res.status(201).json({
      success: true,
      message: 'Internal package created successfully',
      data: {
        trackingNumber: trackingData.trackingNumber,
        mail,
        qrCode,
        estimatedDelivery: trackingData.metadata.estimatedDelivery,
        metadata: trackingData.metadata
      }
    });

  } catch (error) {
    console.error('Generate internal package error:', error);
    next(error);
  }
};

/**
 * Generate shipping label for internal package
 */
export const generateShippingLabel = async (req, res, next) => {
  try {
    const { trackingNumber } = req.params;
    const { format = 'pdf', includeQR = true } = req.query;

    // Find the mail item
    const mail = await Mail.findOne({ 
      trackingNumber: trackingNumber.toUpperCase(),
      carrier: 'INTERNAL'
    }).populate('recipient', 'firstName lastName email');

    if (!mail) {
      return res.status(404).json({
        success: false,
        message: 'Internal package not found'
      });
    }

    // Generate label
    const labelBuffer = await InternalPackageService.generateShippingLabel({
      ...mail.toObject(),
      ...mail.internalPackage
    }, {
      includeQR,
      template: 'standard'
    });

    // Update label generation status
    mail.internalPackage.labelGenerated = true;
    mail.internalPackage.labelGeneratedAt = new Date();
    await mail.save();

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="UNA-Internal-Label-${trackingNumber}.pdf"`);
    res.setHeader('Content-Length', labelBuffer.length);

    res.send(labelBuffer);

  } catch (error) {
    console.error('Generate shipping label error:', error);
    next(error);
  }
};

/**
 * Validate internal tracking number format
 */
export const validateInternalTracking = async (req, res, next) => {
  try {
    const { trackingNumber } = req.query;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        message: 'Tracking number is required'
      });
    }

    const validation = InternalPackageService.validateTrackingNumber(trackingNumber);

    res.json({
      success: true,
      data: {
        trackingNumber,
        valid: validation.valid,
        error: validation.error,
        components: validation.components
      }
    });

  } catch (error) {
    console.error('Validate internal tracking error:', error);
    next(error);
  }
};

/**
 * Generate bulk internal tracking numbers
 */
export const generateBulkInternalPackages = async (req, res, next) => {
  try {
    const { packages = [] } = req.body;

    if (!Array.isArray(packages) || packages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Packages array is required and must not be empty'
      });
    }

    if (packages.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 50 packages can be generated at once'
      });
    }

    const results = [];
    const errors = [];

    for (const [index, packageData] of packages.entries()) {
      try {
        // Validate required fields
        if (!packageData.recipientName) {
          errors.push({ index, error: 'Recipient name is required' });
          continue;
        }

        // Generate tracking number
        const trackingData = InternalPackageService.generateTrackingNumber(packageData);

        // Try to find recipient
        let recipient = null;
        if (packageData.recipientEmail) {
          recipient = await User.findOne({ email: packageData.recipientEmail });
        }

        // Create mail entry
        const mailData = {
          trackingNumber: trackingData.trackingNumber,
          internalTrackingId: trackingData.trackingNumber,
          carrier: 'INTERNAL',
          type: packageData.type || 'PACKAGE',
          size: packageData.size,
          weight: packageData.weight,
          recipient: recipient?._id,
          recipientName: packageData.recipientName,
          recipientEmail: packageData.recipientEmail,
          senderName: packageData.senderName,
          deliveryAddress: packageData.deliveryAddress || {},
          status: 'SCANNED_IN',
          isConfidential: packageData.isConfidential || false,
          specialInstructions: packageData.specialInstructions || '',
          scannedBy: req.user.id,
          lastUpdatedBy: req.user.id,
          internalPackage: trackingData.metadata,
          isDemoData: req.user.isLocalhost || req.user.isDemoUser
        };

        const mail = new Mail(mailData);
        await mail.save();

        // Create tracking history
        const historyEntry = new TrackingHistory({
          mailId: mail._id,
          oldStatus: null,
          newStatus: 'SCANNED_IN',
          changedBy: req.user.id,
          notes: `Bulk internal package created - ${trackingData.metadata.type}`,
          timestamp: new Date()
        });
        await historyEntry.save();

        results.push({
          index,
          trackingNumber: trackingData.trackingNumber,
          estimatedDelivery: trackingData.metadata.estimatedDelivery,
          success: true
        });

      } catch (error) {
        console.error(`Bulk package ${index} error:`, error);
        errors.push({ index, error: error.message });
      }
    }

    const summary = {
      total: packages.length,
      successful: results.length,
      failed: errors.length
    };

    res.status(201).json({
      success: true,
      message: `Bulk internal packages generated: ${summary.successful}/${summary.total} successful`,
      data: {
        packages: results,
        errors,
        summary
      }
    });

  } catch (error) {
    console.error('Bulk internal package generation error:', error);
    next(error);
  }
};

/**
 * Get internal package statistics
 */
export const getInternalPackageStats = async (req, res, next) => {
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
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Aggregate internal package stats
    const stats = await Mail.aggregate([
      {
        $match: {
          carrier: 'INTERNAL',
          scanInDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byType: {
            $push: '$internalPackage.packageType'
          },
          byStatus: {
            $push: '$status'
          },
          byPriority: {
            $push: '$internalPackage.priority.level'
          },
          avgDeliveryTime: {
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

    const result = stats[0] || { total: 0 };
    
    // Count by categories
    const typeStats = {};
    const statusStats = {};
    const priorityStats = {};
    
    if (result.byType) {
      result.byType.forEach(type => {
        typeStats[type] = (typeStats[type] || 0) + 1;
      });
    }
    
    if (result.byStatus) {
      result.byStatus.forEach(status => {
        statusStats[status] = (statusStats[status] || 0) + 1;
      });
    }
    
    if (result.byPriority) {
      result.byPriority.forEach(priority => {
        priorityStats[priority] = (priorityStats[priority] || 0) + 1;
      });
    }

    res.json({
      success: true,
      data: {
        timeframe,
        total: result.total,
        avgDeliveryTime: result.avgDeliveryTime || null,
        breakdown: {
          byType: typeStats,
          byStatus: statusStats,
          byPriority: priorityStats
        }
      }
    });

  } catch (error) {
    console.error('Internal package stats error:', error);
    next(error);
  }
};
