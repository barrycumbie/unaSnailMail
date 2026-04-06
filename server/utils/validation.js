import Joi from 'joi';

// Common validation schemas
export const emailSchema = Joi.string().email().lowercase().trim().required();
export const passwordSchema = Joi.string().min(6).max(128).required();
export const phoneSchema = Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).allow('').optional();
export const objectIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

// User validation schemas
export const validateUserRegistration = (data) => {
  const schema = Joi.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: Joi.string().trim().min(1).max(50).required(),
    lastName: Joi.string().trim().min(1).max(50).required(),
    phone: phoneSchema,
    userType: Joi.string().valid('recipient', 'deliverer').required(),
    
    // Recipient-specific fields
    recipientInfo: Joi.when('userType', {
      is: 'recipient',
      then: Joi.object({
        studentId: Joi.string().trim().optional(),
        employeeId: Joi.string().trim().optional(),
        department: Joi.string().trim().max(100).optional(),
        classification: Joi.string().valid('student', 'faculty', 'staff').required(),
        mailBoxNumber: Joi.string().trim().optional(),
        building: Joi.string().trim().max(100).optional(),
        room: Joi.string().trim().max(50).optional()
      }).required(),
      otherwise: Joi.forbidden()
    }),
    
    // Deliverer-specific fields
    delivererInfo: Joi.when('userType', {
      is: 'deliverer',
      then: Joi.object({
        employeeId: Joi.string().trim().required(),
        level: Joi.number().integer().valid(1, 2, 3).required(),
        department: Joi.string().trim().max(100).default('Mail Room')
      }).required(),
      otherwise: Joi.forbidden()
    })
  });
  
  return schema.validate(data);
};

export const validateUserLogin = (data) => {
  const schema = Joi.object({
    email: emailSchema,
    password: Joi.string().required(),
    userType: Joi.string().valid('recipient', 'deliverer').optional(),
    rememberMe: Joi.boolean().optional()
  });
  
  return schema.validate(data);
};

export const validatePasswordChange = (data) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: passwordSchema,
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
  });
  
  return schema.validate(data);
};

// Mail/Package validation schemas
export const validateMailScan = (data) => {
  const schema = Joi.object({
    trackingNumber: Joi.string().trim().uppercase().required(),
    carrier: Joi.string().valid('UPS', 'USPS', 'FEDEX', 'AMAZON', 'DHL', 'OTHER').required(),
    type: Joi.string().valid('LETTER', 'PACKAGE', 'CERTIFIED_MAIL', 'REGISTERED_MAIL', 'EXPRESS', 'PRIORITY').required(),
    size: Joi.string().valid('SMALL', 'MEDIUM', 'LARGE', 'OVERSIZED').optional(),
    weight: Joi.number().positive().optional(),
    
    // Recipient information
    recipientName: Joi.string().trim().required(),
    recipientEmail: Joi.string().email().optional(),
    
    // Delivery address
    deliveryAddress: Joi.object({
      name: Joi.string().trim().optional(),
      building: Joi.string().trim().optional(),
      room: Joi.string().trim().optional(),
      department: Joi.string().trim().optional(),
      mailBox: Joi.string().trim().optional(),
      fullAddress: Joi.string().trim().required()
    }).required(),
    
    // Sender information
    senderName: Joi.string().trim().optional(),
    senderAddress: Joi.string().trim().optional(),
    returnAddress: Joi.string().trim().optional(),
    
    // Special handling
    requiresSignature: Joi.boolean().default(false),
    isFragile: Joi.boolean().default(false),
    isConfidential: Joi.boolean().default(false),
    specialInstructions: Joi.string().trim().max(500).optional(),
    
    // Expected delivery
    expectedDeliveryDate: Joi.date().min('now').optional(),
    
    // Location
    currentLocation: Joi.object({
      zone: Joi.string().trim().optional(),
      shelf: Joi.string().trim().optional(),
      bin: Joi.string().trim().optional(),
      notes: Joi.string().trim().max(200).optional()
    }).optional()
  });
  
  return schema.validate(data);
};

export const validateStatusUpdate = (data) => {
  const schema = Joi.object({
    status: Joi.string().valid(
      'SCANNED_IN', 'PROCESSING', 'READY_PICKUP', 'OUT_DELIVERY',
      'DELIVERED', 'PICKUP_READY', 'PICKED_UP', 'RETURNED_SENDER',
      'EXCEPTION', 'LOST', 'DAMAGED'
    ).required(),
    notes: Joi.string().trim().max(500).optional(),
    location: Joi.object({
      zone: Joi.string().trim().optional(),
      shelf: Joi.string().trim().optional(),
      bin: Joi.string().trim().optional(),
      notes: Joi.string().trim().max(200).optional()
    }).optional(),
    notifyRecipient: Joi.boolean().default(true)
  });
  
  return schema.validate(data);
};

// Issue validation schemas
export const validateIssueReport = (data) => {
  const schema = Joi.object({
    mailId: objectIdSchema.optional(),
    trackingNumber: Joi.string().trim().optional(),
    title: Joi.string().trim().min(5).max(200).required(),
    description: Joi.string().trim().min(10).max(2000).required(),
    category: Joi.string().valid(
      'DELIVERY_DELAY', 'PACKAGE_DAMAGED', 'PACKAGE_LOST',
      'WRONG_RECIPIENT', 'MISSING_PACKAGE', 'DELIVERY_ADDRESS_ISSUE',
      'CARRIER_ISSUE', 'SYSTEM_ERROR', 'NOTIFICATION_ISSUE',
      'ACCESS_ISSUE', 'OTHER'
    ).required(),
    priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').default('MEDIUM')
  });
  
  return schema.validate(data);
};

export const validateIssueUpdate = (data) => {
  const schema = Joi.object({
    message: Joi.string().trim().min(1).max(1000).required(),
    isInternal: Joi.boolean().default(false),
    status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED').optional(),
    assignTo: objectIdSchema.optional(),
    priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').optional()
  });
  
  return schema.validate(data);
};

// Search and filter validation
export const validateSearchQuery = (data) => {
  const schema = Joi.object({
    q: Joi.string().trim().min(1).max(100).optional(),
    status: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).optional(),
    carrier: Joi.alternatives().try(
      Joi.string().valid('UPS', 'USPS', 'FEDEX', 'AMAZON', 'DHL', 'OTHER'),
      Joi.array().items(Joi.string().valid('UPS', 'USPS', 'FEDEX', 'AMAZON', 'DHL', 'OTHER'))
    ).optional(),
    type: Joi.alternatives().try(
      Joi.string(),
      Joi.array().items(Joi.string())
    ).optional(),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().min(Joi.ref('dateFrom')).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('scanInDate', 'status', 'carrier', 'recipient').default('scanInDate'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  });
  
  return schema.validate(data);
};

// Pagination validation
export const validatePagination = (data) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  });
  
  return schema.validate(data);
};

// Demo data validation
export const validateDemoAccess = (data) => {
  const schema = Joi.object({
    demoCode: Joi.string().valid('DEMO2026', 'UNA_DEMO', 'LOCALHOST').optional(),
    duration: Joi.number().integer().min(1).max(240).default(60) // minutes
  });
  
  return schema.validate(data);
};

// Utility function to format validation errors
export const formatValidationError = (error) => {
  if (!error || !error.details) return 'Validation error';
  
  const message = error.details
    .map(detail => detail.message.replace(/"/g, ''))
    .join(', ');
    
  return message;
};

// Middleware factory for validation
export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message.replace(/"/g, '')
        }))
      });
    }
    
    next();
  };
};