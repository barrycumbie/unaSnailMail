# UNA Snail Mail - Mail Room Management System

A comprehensive mail room management system built for the University of North Alabama to replace EZTrack. The system provides separate interfaces for recipients and mail room staff with full tracking, issue reporting, and administrative capabilities.

## 🏗️ Architecture Overview

### Two-Domain System
- **`mail.una.edu`** - Recipients (students, faculty, staff) portal
- **`admin.mail.una.edu`** - Mail room staff portal  
- **`demo.mail.una.edu`** - Demo mode for testing

### User Types & Permissions
- **Recipients**: Students, faculty, and staff who receive mail
- **Deliverers**: Mail room staff with 3 hierarchical levels
  - **Level 1 (Worker)**: Scan mail, update status
  - **Level 2 (Supervisor)**: Worker permissions + view reports, manage recipients
  - **Level 3 (Admin)**: Full system access + user management

## 🚀 Features

### Core Functionality
- **Mail/Package Scanning**: Barcode scanning with carrier integration
- **Real-time Tracking**: Live status updates throughout delivery process
- **Issue Reporting**: Problem reporting and resolution workflow
- **Notifications**: Email/SMS notifications for status changes
- **Analytics**: Comprehensive reporting and analytics dashboard
- **Demo Mode**: Full-featured demo for testing and training

### Carrier Integrations
- UPS, USPS, FedEx, Amazon, DHL support
- Automatic tracking number validation
- Carrier-specific handling rules

### Security Features  
- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Rate limiting and brute force protection  
- Subdomain-based access isolation
- Account lockout after failed attempts

## 🛠️ Technology Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **JWT** for authentication
- **Joi** for validation
- **bcryptjs** for password hashing
- **Helmet** for security headers
- **Morgan** for logging

### Key Dependencies
```json
{
  "express": "^4.22.1",
  "mongoose": "^8.0.0", 
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^2.4.3",
  "joi": "^17.11.0",
  "helmet": "^7.1.0",
  "cors": "^2.8.5"
}
```

## 📋 Prerequisites

- Node.js 18+
- MongoDB 5.0+
- Git

## ⚡ Quick Start

### 1. Clone and Install
```bash
git clone <repository-url>
cd unaSnailMail
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup
```bash
# Start MongoDB (if using local instance)
mongod

# Seed the database with demo data
npm run seed
```

### 4. Start Development Server
```bash
npm run dev
```

The server will start on `http://localhost:8080`

## 🔧 Configuration

### Demo Credentials

After running `npm run seed`:

**Admin Access:**
- Email: `admin@una.edu`
- Password: `admin123`
- Level: 3 (Full Access)

**Supervisor Access:**
- Email: `supervisor@una.edu` 
- Password: `super123`
- Level: 2 (Reports + User Management)

**Worker Access:**
- Email: `worker1@una.edu`
- Password: `worker123`
- Level: 1 (Scan + Update)

**Recipient Access:**
- Email: `student1@una.edu`, `faculty1@una.edu`, `staff1@una.edu`
- Password: `recipient123`

## 📡 API Endpoints

### Authentication
- `POST /api/auth/recipient/login` - Recipient login
- `POST /api/auth/deliverer/login` - Deliverer login  
- `POST /api/auth/demo/login` - Demo access
- `GET /api/auth/profile` - Get user profile

### Mail Management
- `POST /api/mail/scan` - Scan new mail (deliverers)
- `GET /api/mail/track/:trackingNumber` - Public tracking
- `GET /api/mail` - Search mail (authenticated)
- `PATCH /api/mail/:id/status` - Update status (deliverers)

### Dashboard
- `GET /api/dashboard/recipient` - Recipient dashboard
- `GET /api/dashboard/deliverer` - Deliverer dashboard
- `GET /api/dashboard/admin` - Admin dashboard

### Issues  
- `POST /api/issues` - Report issue
- `GET /api/issues` - List issues
- `PATCH /api/issues/:id` - Update issue

### User Management
- `GET /api/users/deliverers` - List deliverers (admin)
- `GET /api/users/recipients` - List recipients (supervisor+)

## 🔐 Security Features

### Authentication Flow
1. **Login**: User credentials validated against database
2. **Token Generation**: JWT access token (7d) + refresh token (30d)
3. **Request Authorization**: Bearer token validation on protected routes
4. **Token Refresh**: Automatic token renewal using refresh token

### Authorization Levels
- **Public**: Package tracking by tracking number
- **Authenticated**: Profile access, issue reporting
- **Deliverer**: Mail scanning, status updates  
- **Supervisor**: Reports, recipient management
- **Admin**: Full system access, user management

## 🧪 Testing the System

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Database
```bash
npm run seed
```

### 3. Start Server
```bash
npm run dev
```

### 4. Test Authentication
```bash
# Login as admin
curl -X POST http://localhost:8080/api/auth/deliverer/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@una.edu", "password": "admin123"}'
```

### 5. Test Mail Scanning
```bash
# Use token from login response
curl -X POST http://localhost:8080/api/mail/scan \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumber": "TEST123456789",
    "carrier": "UPS",
    "type": "PACKAGE",
    "recipientName": "Alice Student",
    "deliveryAddress": {
      "building": "Dorm A",
      "room": "101",
      "fullAddress": "Dorm A Room 101"
    }
  }'
```

### 6. Test Public Tracking
```bash
curl http://localhost:8080/api/mail/track/TEST123456789
```

## 📊 System Architecture

### Database Models
- **User**: Recipients and deliverers with role-based permissions
- **Mail**: Package/letter tracking with full delivery lifecycle
- **TrackingHistory**: Detailed audit trail of all status changes
- **Issue**: Problem reports with SLA tracking and resolution workflow

### Permission System
```javascript
Level 1 (Worker): ['scan_mail', 'update_status']
Level 2 (Supervisor): ['scan_mail', 'update_status', 'view_reports']
Level 3 (Admin): ['scan_mail', 'update_status', 'view_reports', 'manage_users', 'system_admin']
```

## 🚀 Deployment

### Environment Variables
```env
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/una-snail-mail
JWT_SECRET=your-strong-secret-key
PORT=8080
```

### Production Checklist
- [ ] Configure strong JWT secrets
- [ ] Set up MongoDB with authentication
- [ ] Configure CORS for production domains
- [ ] Set up SSL/TLS certificates
- [ ] Configure rate limiting
- [ ] Set up monitoring and logging

## 🤝 Development

### Project Structure
```
server/
├── controllers/     # Business logic
├── middleware/      # Auth, validation, error handling
├── models/         # Database schemas
├── routes/         # API endpoints
├── utils/          # Helper functions
├── config/         # Database connection
└── scripts/        # Seed, migration scripts
```

### Adding New Features
1. Create/update models in `/models/`
2. Add validation schemas in `/utils/validation.js`
3. Implement controllers in `/controllers/`
4. Define routes in `/routes/`
5. Update tests and documentation

## 📞 Support

### Common Issues
1. **Database Connection**: Ensure MongoDB is running
2. **Authentication**: Check JWT_SECRET configuration  
3. **Permissions**: Verify user roles and access levels
4. **Demo Data**: Run `npm run seed` to populate test data

### API Response Format
```javascript
{
  success: boolean,
  message: string,
  data?: object,
  errors?: array
}
```

---

**Built for University of North Alabama Mail Room Operations**

Dev Server: https://unasnailmail.onrender.com  
Prod Server: GCP / 34.67.114.135 
