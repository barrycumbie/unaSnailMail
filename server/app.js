import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Import configuration
import { CONFIG, isLocalhost, isProduction } from "./config/environment.js";

// Import database connection
import connectDatabase from "./config/database.js";

// Import routes  
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import mailRoutes from "./routes/mail.routes.js";
import issueRoutes from "./routes/issue.routes.js";
import adminRoutes from "./routes/admin.routes.js";

// Import middleware
import errorMiddleware from "./middleware/error.middleware.js";
import { subdomainAuth } from "./middleware/auth.middleware.js";

const app = express();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Connect to database
connectDatabase();

// Security middleware (disabled for localhost)
if (CONFIG.SECURITY.HELMET_ENABLED) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));
}

// CORS configuration with environment-aware origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check against environment-specific allowed origins
    if (CONFIG.CORS.ORIGINS.includes(origin)) {
      callback(null, true);
    } else if (isLocalhost() && origin.includes('localhost')) {
      // Allow any localhost origin in development
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting (relaxed for localhost)
const limiter = rateLimit({
  windowMs: CONFIG.RATE_LIMIT.WINDOW_MS,
  max: CONFIG.RATE_LIMIT.MAX_REQUESTS,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: CONFIG.RATE_LIMIT.WINDOW_MS,
  max: CONFIG.RATE_LIMIT.AUTH_MAX,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  }
});
app.use('/api/auth', authLimiter);

// Compression middleware
app.use(compression());

// Logging middleware (environment aware)
if (CONFIG.LOGGING.FORMAT === 'combined') {
  app.use(morgan('combined'));
} else {
  app.use(morgan(CONFIG.LOGGING.FORMAT));
}

// Body parsing middleware
const maxSize = CONFIG.UPLOADS.MAX_SIZE;
app.use(express.json({ limit: maxSize }));
app.use(express.urlencoded({ extended: true, limit: maxSize }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Trust proxy in production
if (CONFIG.SECURITY.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

// Subdomain-based access control (disabled for localhost)
if (CONFIG.SECURITY.SUBDOMAIN_CHECK) {
  app.use(subdomainAuth);
}

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);  
app.use("/api/mail", mailRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/admin", adminRoutes);

// Environment info endpoint (helpful for debugging)
app.get("/api/environment", (req, res) => {
  res.json({
    environment: CONFIG.ENVIRONMENT,
    isDemo: CONFIG.IS_DEMO,
    isLocalhost: CONFIG.IS_LOCALHOST,
    host: CONFIG.HOST,
    port: CONFIG.PORT,
    demoEnabled: CONFIG.DEMO.ENABLED,
    // Don't expose sensitive config in production
    ...(isLocalhost() && {
      config: {
        database: CONFIG.DATABASE.URI.replace(/\/\/.*@/, '//***@'),
        cors: CONFIG.CORS.ORIGINS,
        rateLimit: CONFIG.RATE_LIMIT
      }
    })
  });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    environment: CONFIG.ENVIRONMENT,
    uptime: process.uptime(),
    demo: CONFIG.IS_DEMO,
    localhost: CONFIG.IS_LOCALHOST
  });
});

// API version info
app.get("/api", (req, res) => {
  res.json({
    name: "UNA Snail Mail API",
    version: "1.0.0",
    description: "Mail room management system for University of North Alabama",
    environment: CONFIG.ENVIRONMENT,
    demo: CONFIG.IS_DEMO,
    endpoints: {
      auth: "/api/auth",
      users: "/api/users", 
      dashboard: "/api/dashboard",
      mail: "/api/mail",
      issues: "/api/issues",
      health: "/api/health",
      environment: "/api/environment"
    },
    ...(isLocalhost() && {
      localDev: {
        message: "🏠 Local development mode active",
        demoCodes: CONFIG.DEMO.CODES,
        adminLogin: "admin@una.edu / admin123",
        recipientLogin: "student1@una.edu / recipient123"
      }
    })
  });
});

// Catch-all for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Error handling middleware (must be last)
app.use(errorMiddleware);

export default app;