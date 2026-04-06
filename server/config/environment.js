/**
 * Environment Detection and Configuration
 * Automatically detects environment and sets appropriate configurations
 */

// Environment detection
const detectEnvironment = () => {
  const hostname = process.env.HOSTNAME || 'localhost';
  const port = process.env.PORT || 8080;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Check various environment indicators
  const isLocalhost = hostname.includes('localhost') || 
                     hostname === '127.0.0.1' ||
                     hostname.includes('0.0.0.0') ||
                     process.env.LOCAL_DEV === 'true';
  
  const isProduction = nodeEnv === 'production' ||
                      hostname.includes('una.edu') ||
                      process.env.PROD === 'true';
                      
  const isDemo = process.env.DEMO_MODE === 'true' ||
                isLocalhost ||
                hostname.includes('demo') ||
                port == 8080;
  
  const isStaging = hostname.includes('staging') ||
                   hostname.includes('test') ||
                   nodeEnv === 'staging';

  // Determine environment type
  let environment = 'development';
  if (isProduction) {
    environment = 'production';
  } else if (isStaging) {
    environment = 'staging';
  } else if (isLocalhost) {
    environment = 'local';
  }
  
  return {
    environment,
    isLocalhost,
    isProduction,
    isStaging,
    isDemo,
    hostname,
    port,
    nodeEnv
  };
};

// Get environment info
const ENV = detectEnvironment();

// Global configuration based on environment
export const CONFIG = {
  // Environment info
  ENVIRONMENT: ENV.environment,
  IS_LOCALHOST: ENV.isLocalhost,
  IS_PRODUCTION: ENV.isProduction,
  IS_STAGING: ENV.isStaging,
  IS_DEMO: ENV.isDemo,
  HOST: ENV.hostname,
  PORT: ENV.port,
  
  // Database configuration
  DATABASE: {
    URI: ENV.isLocalhost 
      ? 'mongodb://localhost:27017/una-snail-mail-local'
      : ENV.isDemo
        ? 'mongodb://localhost:27017/una-snail-mail-demo'
        : process.env.MONGODB_URI || 'mongodb://localhost:27017/una-snail-mail',
    
    OPTIONS: {
      maxPoolSize: ENV.isLocalhost ? 5 : 10,
      serverSelectionTimeoutMS: ENV.isLocalhost ? 3000 : 5000,
      socketTimeoutMS: 45000,
      ...(ENV.isLocalhost && {
        autoIndex: true,
        autoCreate: true
      })
    }
  },
  
  // JWT Configuration
  JWT: {
    SECRET: process.env.JWT_SECRET || (ENV.isLocalhost ? 'localhost-jwt-secret-dev-only' : 'change-me-in-production'),
    EXPIRE: ENV.isLocalhost ? '24h' : (process.env.JWT_EXPIRE || '7d'),
    REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || (ENV.isLocalhost ? 'localhost-refresh-secret' : 'change-refresh-in-production'),
    REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d'
  },
  
  // Demo configuration  
  DEMO: {
    ENABLED: ENV.isDemo,
    AUTO_LOGIN: ENV.isLocalhost,
    CODES: ['DEMO2026', 'UNA_DEMO', 'LOCALHOST'],
    TOKEN_EXPIRE: '8h', // Longer for local dev
    DATA_PREFIX: ENV.isLocalhost ? 'LOCAL_' : 'DEMO_'
  },
  
  // API Configuration
  API: {
    BASE_URL: ENV.isLocalhost 
      ? `http://localhost:${ENV.port}` 
      : ENV.isProduction
        ? 'https://api.una.edu'
        : `https://${ENV.hostname}`,
    VERSION: 'v1',
    PREFIX: '/api'
  },
  
  // Domain configuration
  DOMAINS: {
    RECIPIENT: ENV.isLocalhost ? `localhost:${ENV.port}` : 'mail.una.edu',
    ADMIN: ENV.isLocalhost ? `localhost:${ENV.port}` : 'admin.mail.una.edu', 
    DEMO: ENV.isLocalhost ? `localhost:${ENV.port}` : 'demo.mail.una.edu'
  },
  
  // CORS origins based on environment
  CORS: {
    ORIGINS: ENV.isLocalhost 
      ? [
          `http://localhost:${ENV.port}`,
          'http://localhost:3000',
          'http://localhost:3001', 
          'http://localhost:5173',
          'http://127.0.0.1:3000',
          'http://0.0.0.0:3000'
        ]
      : ENV.isProduction
        ? [
            'https://mail.una.edu',
            'https://admin.mail.una.edu',
            'https://demo.mail.una.edu'
          ]
        : [
            `https://${ENV.hostname}`,
            'http://localhost:3000'
          ]
  },
  
  // Rate limiting
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: ENV.isLocalhost ? 1000 : (ENV.isProduction ? 100 : 500),
    AUTH_MAX: ENV.isLocalhost ? 50 : 10
  },
  
  // File upload paths  
  UPLOADS: {
    PATH: ENV.isLocalhost ? './uploads/local/' : (process.env.UPLOAD_PATH || './uploads/'),
    MAX_SIZE: ENV.isLocalhost ? 50 * 1024 * 1024 : (process.env.MAX_FILE_SIZE || 10 * 1024 * 1024), // 50MB local, 10MB prod
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
  },
  
  // Logging configuration
  LOGGING: {
    LEVEL: ENV.isLocalhost ? 'debug' : (ENV.isProduction ? 'warn' : 'info'),
    FORMAT: ENV.isLocalhost ? 'dev' : 'combined',
    FILE: ENV.isProduction ? './logs/app.log' : null
  },
  
  // Security settings
  SECURITY: {
    HELMET_ENABLED: !ENV.isLocalhost,
    TRUST_PROXY: ENV.isProduction,
    SUBDOMAIN_CHECK: ENV.isProduction,
    HTTPS_ONLY: ENV.isProduction
  },
  
  // External services / Carrier APIs
  CARRIER_APIS: {
    UPS_API: process.env.UPS_API_KEY || (ENV.isDemo ? 'demo-ups-key' : null),
    USPS_API: process.env.USPS_API_KEY || (ENV.isDemo ? 'demo-usps-key' : null),
    FEDEX_API: process.env.FEDEX_API_KEY || (ENV.isDemo ? 'demo-fedex-key' : null),
    AMAZON_API: process.env.AMAZON_API_KEY || (ENV.isDemo ? 'demo-amazon-key' : null)
  },
  
  // Email configuration 
  EMAIL: {
    ENABLED: ENV.isProduction,
    SMTP_HOST: process.env.SMTP_HOST || 'localhost',
    SMTP_PORT: process.env.SMTP_PORT || 587,
    SMTP_USER: process.env.SMTP_USER || 'test@localhost',
    SMTP_PASS: process.env.SMTP_PASS || 'password',
    FROM_EMAIL: ENV.isLocalhost ? 'noreply@localhost' : 'noreply@una.edu'
  }
};

// Helper functions
export const isDevelopment = () => CONFIG.ENVIRONMENT === 'development' || CONFIG.IS_LOCALHOST;
export const isProduction = () => CONFIG.IS_PRODUCTION;
export const isDemo = () => CONFIG.IS_DEMO;
export const isLocalhost = () => CONFIG.IS_LOCALHOST;

// Get API URL helper
export const getApiUrl = (path = '') => {
  return `${CONFIG.API.BASE_URL}${CONFIG.API.PREFIX}${path}`;
};

// Get domain for user type
export const getDomainForUserType = (userType) => {
  switch (userType) {
    case 'recipient': return CONFIG.DOMAINS.RECIPIENT;
    case 'deliverer': return CONFIG.DOMAINS.ADMIN;
    default: return CONFIG.DOMAINS.DEMO;
  }
}; 

// Print environment info on startup
export const printEnvironmentInfo = () => {
  console.log('\n🔧 ENVIRONMENT CONFIGURATION');
  console.log('=====================================');
  console.log(`Environment: ${CONFIG.ENVIRONMENT.toUpperCase()}`);
  console.log(`Host: ${CONFIG.HOST}:${CONFIG.PORT}`);
  console.log(`Demo Mode: ${CONFIG.DEMO.ENABLED ? '✅' : '❌'}`);
  console.log(`Database: ${CONFIG.DATABASE.URI.split('@').pop() || CONFIG.DATABASE.URI}`);
  console.log(`CORS Origins: ${CONFIG.CORS.ORIGINS.join(', ')}`);
  console.log(`Rate Limit: ${CONFIG.RATE_LIMIT.MAX_REQUESTS} req/15min`);
  
  if (CONFIG.IS_LOCALHOST) {
    console.log('\n🚀 LOCALHOST DETECTED - Auto-configured for development');
    console.log(`Demo codes: ${CONFIG.DEMO.CODES.join(', ')}`);
    console.log('Use any demo code or login with seeded users');
  }
  
  if (CONFIG.IS_DEMO) {
    console.log('\n🎭 DEMO MODE ENABLED');
  }
  
  console.log('=====================================\n');
};

export default CONFIG;