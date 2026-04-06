import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  // Common fields for all users
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  
  // User type: 'recipient' or 'deliverer'
  userType: {
    type: String,
    required: true,
    enum: ['recipient', 'deliverer']
  },
  
  // For recipients (students, faculty, staff)
  recipientInfo: {
    studentId: String, // UNA student ID if applicable
    employeeId: String, // UNA employee ID if applicable
    department: String,
    classification: {
      type: String,
      enum: ['student', 'faculty', 'staff']
    },
    mailBoxNumber: String,
    building: String,
    room: String,
    isActive: {
      type: Boolean,
      default: true
    }
  },
  
  // For deliverers (mail room staff)
  delivererInfo: {
    employeeId: {
      type: String,
      required: function() { return this.userType === 'deliverer'; }
    },
    level: {
      type: Number,
      enum: [1, 2, 3], // 1=worker, 2=supervisor, 3=admin
      required: function() { return this.userType === 'deliverer'; }
    },
    department: {
      type: String,
      default: 'Mail Room'
    },
    permissions: [{
      type: String,
      enum: [
        'scan_mail',
        'update_status',
        'view_reports',
        'manage_users',
        'system_admin',
        'demo_access'
      ]
    }]
  },
  
  // Authentication & Security
  lastLogin: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
  // Demo mode
  isDemoUser: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes (unique fields auto-indexed)
// userSchema.index({ email: 1 }); // Already unique
userSchema.index({ 'recipientInfo.studentId': 1 });
userSchema.index({ 'recipientInfo.employeeId': 1 });
userSchema.index({ 'delivererInfo.employeeId': 1 });
userSchema.index({ userType: 1 });

// Virtual for account locked status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.increaseLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Static methods
userSchema.statics.getPermissionsByLevel = function(level) {
  const permissions = {
    1: ['scan_mail', 'update_status'], // Worker
    2: ['scan_mail', 'update_status', 'view_reports'], // Supervisor
    3: ['scan_mail', 'update_status', 'view_reports', 'manage_users', 'system_admin'] // Admin
  };
  return permissions[level] || [];
};

export default mongoose.model('User', userSchema);