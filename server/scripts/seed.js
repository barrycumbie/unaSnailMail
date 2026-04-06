import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Import models
import User from '../models/User.js';
import Mail from '../models/Mail.js';
import TrackingHistory from '../models/TrackingHistory.js';
import Issue from '../models/Issue.js';

// Connect to database
async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/una-snail-mail';
    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected for seeding');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

// Clear existing data
async function clearData() {
  try {
    await Promise.all([
      User.deleteMany({}),
      Mail.deleteMany({}),
      TrackingHistory.deleteMany({}),
      Issue.deleteMany({})
    ]);
    console.log('Cleared existing data');
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
}

// Create users
async function createUsers() {
  const users = [];
  
  // Create admin user (level 3)
  const admin = await User.create({
    email: 'admin@una.edu',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User',
    userType: 'deliverer',
    delivererInfo: {
      employeeId: 'EMP001',
      level: 3,
      permissions: ['scan_mail', 'update_status', 'view_reports', 'manage_users', 'system_admin']
    }
  });
  users.push(admin);
  console.log('Created admin user: admin@una.edu / admin123');
  
  // Create supervisor (level 2)
  const supervisor = await User.create({
    email: 'supervisor@una.edu',
    password: 'super123',
    firstName: 'Jane',
    lastName: 'Supervisor',
    userType: 'deliverer',
    delivererInfo: {
      employeeId: 'EMP002',
      level: 2,
      permissions: ['scan_mail', 'update_status', 'view_reports']
    }
  });
  users.push(supervisor);
  console.log('Created supervisor: supervisor@una.edu / super123');
  
  // Create workers (level 1)
  const workers = [
    {
      email: 'worker1@una.edu',
      firstName: 'John',
      lastName: 'Worker',
      employeeId: 'EMP003'
    },
    {
      email: 'worker2@una.edu', 
      firstName: 'Mary',
      lastName: 'Helper',
      employeeId: 'EMP004'
    }
  ];
  
  for (const workerData of workers) {
    const worker = await User.create({
      ...workerData,
      password: 'worker123',
      userType: 'deliverer',
      delivererInfo: {
        employeeId: workerData.employeeId,
        level: 1,
        permissions: ['scan_mail', 'update_status']
      }
    });
    users.push(worker);
    console.log(`Created worker: ${workerData.email} / worker123`);
  }
  
  // Create recipients
  const recipients = [
    {
      email: 'student1@una.edu',
      firstName: 'Alice',
      lastName: 'Student',
      studentId: 'STU001',
      classification: 'student',
      building: 'Dorm A',
      room: '101'
    },
    {
      email: 'faculty1@una.edu',
      firstName: 'Dr. Bob',
      lastName: 'Professor',
      employeeId: 'FAC001',
      classification: 'faculty',
      building: 'Academic Building',
      room: '201',
      department: 'Computer Science'
    },
    {
      email: 'staff1@una.edu',
      firstName: 'Carol',
      lastName: 'Staff',
      employeeId: 'STF001',
      classification: 'staff',
      building: 'Admin Building',
      room: '301',
      department: 'Finance'
    }
  ];
  
  for (const recipientData of recipients) {
    const { email, firstName, lastName, ...recipientInfo } = recipientData;
    const recipient = await User.create({
      email,
      firstName,
      lastName,
      password: 'recipient123',
      userType: 'recipient',
      recipientInfo
    });
    users.push(recipient);
    console.log(`Created recipient: ${email} / recipient123`);
  }
  
  return users;
}

// Create demo mail items
async function createDemoMail(users) {
  const deliverers = users.filter(u => u.userType === 'deliverer');
  const recipients = users.filter(u => u.userType === 'recipient');
  
  const carriers = ['UPS', 'USPS', 'FEDEX', 'AMAZON', 'DHL'];
  const types = ['PACKAGE', 'LETTER', 'CERTIFIED_MAIL', 'EXPRESS'];
  const statuses = ['SCANNED_IN', 'PROCESSING', 'READY_PICKUP', 'DELIVERED', 'PICKED_UP'];
  
  const mailItems = [];
  
  // Create 50 demo mail items
  for (let i = 1; i <= 50; i++) {
    const recipient = recipients[Math.floor(Math.random() * recipients.length)];
    const scannedBy = deliverers[Math.floor(Math.random() * deliverers.length)];
    const carrier = carriers[Math.floor(Math.random() * carriers.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    // Generate realistic tracking number
    const trackingNumber = `${carrier}${Date.now()}${i.toString().padStart(3, '0')}`;
    const internalTrackingId = `UNA-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Random date within last 30 days
    const scanInDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    
    const mail = await Mail.create({
      trackingNumber,
      internalTrackingId,
      carrier,
      type,
      recipient: recipient._id,
      recipientName: `${recipient.firstName} ${recipient.lastName}`,
      recipientEmail: recipient.email,
      deliveryAddress: {
        name: `${recipient.firstName} ${recipient.lastName}`,
        building: recipient.recipientInfo.building || 'Building A',
        room: recipient.recipientInfo.room || '100',
        department: recipient.recipientInfo.department || '',
        fullAddress: `${recipient.recipientInfo.building || 'Building A'} Room ${recipient.recipientInfo.room || '100'}`
      },
      senderName: `Sender ${i}`,
      senderAddress: `123 Sender St, City, ST 12345`,
      status,
      scanInDate,
      actualDeliveryDate: ['DELIVERED', 'PICKED_UP'].includes(status) 
        ? new Date(scanInDate.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000)
        : null,
      scannedBy: scannedBy._id,
      lastUpdatedBy: scannedBy._id,
      currentLocation: {
        zone: 'SORTING',
        shelf: `S${Math.floor(Math.random() * 10) + 1}`,
        bin: `B${Math.floor(Math.random() * 20) + 1}`
      },
      isDemoData: true
    });
    
    mailItems.push(mail);
    
    // Create tracking history
    await TrackingHistory.createEntry(
      mail,
      null,
      'SCANNED_IN',
      { _id: scannedBy._id, firstName: scannedBy.firstName, lastName: scannedBy.lastName, email: scannedBy.email, userType: 'deliverer' },
      {
        reason: 'Initial scan',
        notes: 'Demo mail item scanned into system',
        metadata: { demo: true }
      }
    );
    
    // Add additional status updates for some items
    if (status !== 'SCANNED_IN') {
      await TrackingHistory.createEntry(
        mail,
        'SCANNED_IN',
        status,
        { _id: scannedBy._id, firstName: scannedBy.firstName, lastName: scannedBy.lastName, email: scannedBy.email, userType: 'deliverer' },
        {
          reason: 'Status update',
          notes: `Demo status change to ${status}`,
          metadata: { demo: true }
        }
      );
    }
  }
  
  console.log(`Created ${mailItems.length} demo mail items`);
  return mailItems;
}

// Create demo issues
async function createDemoIssues(users, mailItems) {
  const recipients = users.filter(u => u.userType === 'recipient');
  const deliverers = users.filter(u => u.userType === 'deliverer');
  
  const categories = [
    'DELIVERY_DELAY', 'PACKAGE_DAMAGED', 'PACKAGE_LOST',
    'WRONG_RECIPIENT', 'MISSING_PACKAGE', 'NOTIFICATION_ISSUE'
  ];
  
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
  
  const issues = [];
  
  // Create 15 demo issues
  for (let i = 1; i <= 15; i++) {
    const reporter = recipients[Math.floor(Math.random() * recipients.length)];
    const mail = mailItems[Math.floor(Math.random() * mailItems.length)];
    const category = categories[Math.floor(Math.random() * categories.length)];
    const priority = priorities[Math.floor(Math.random() * priorities.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    const issue = await Issue.create({
      mailId: mail._id,
      trackingNumber: mail.trackingNumber,
      title: `Demo Issue ${i}: ${category.replace('_', ' ').toLowerCase()}`,
      description: `This is a demo issue related to ${category.replace('_', ' ').toLowerCase()}. The issue was reported by ${reporter.firstName} ${reporter.lastName} regarding tracking number ${mail.trackingNumber}.`,
      category,
      priority,
      status,
      reportedBy: reporter._id,
      reporterInfo: {
        name: `${reporter.firstName} ${reporter.lastName}`,
        email: reporter.email,
        userType: reporter.userType
      },
      isDemoData: true,
      slaInfo: {
        responseTimeTarget: priority === 'URGENT' ? 1 : priority === 'HIGH' ? 4 : 8,
        resolutionTimeTarget: priority === 'URGENT' ? 4 : priority === 'HIGH' ? 24 : 72
      }
    });
    
    // Assign some issues
    if (Math.random() > 0.5) {
      const assignee = deliverers[Math.floor(Math.random() * deliverers.length)];
      issue.assignedTo = assignee._id;
      issue.assignedAt = new Date();
      issue.slaInfo.respondedAt = new Date();
      await issue.save();
    }
    
    // Resolve some issues
    if (status === 'RESOLVED') {
      const resolver = deliverers[Math.floor(Math.random() * deliverers.length)];
      issue.resolvedBy = resolver._id;
      issue.resolvedAt = new Date();
      issue.resolution = 'RESOLVED_DELIVERED';
      issue.resolverNotes = 'Demo issue resolution';
      await issue.save();
    }
    
    issues.push(issue);
  }
  
  console.log(`Created ${issues.length} demo issues`);
  return issues;
}

// Main seeding function
async function seedDatabase() {
  try {
    console.log('Starting database seeding...');
    
    await connectDB();
    await clearData();
    
    const users = await createUsers();
    const mailItems = await createDemoMail(users);
    const issues = await createDemoIssues(users, mailItems);
    
    console.log('\n=== SEEDING COMPLETE ===');
    console.log('\nDemo Users Created:');
    console.log('Admin: admin@una.edu / admin123');
    console.log('Supervisor: supervisor@una.edu / super123');
    console.log('Workers: worker1@una.edu, worker2@una.edu / worker123');
    console.log('Recipients: student1@una.edu, faculty1@una.edu, staff1@una.edu / recipient123');
    console.log(`\nDemo Data: ${mailItems.length} mail items, ${issues.length} issues`);
    console.log('\nUse these credentials to test the system!');
    
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed');
  }
}

// Run the seeding if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
}

export default seedDatabase;