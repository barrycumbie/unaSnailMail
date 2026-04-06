import mongoose from 'mongoose';
import { CONFIG, printEnvironmentInfo } from './environment.js';

const connectDatabase = async () => {
  try {
    // Print environment info on first connection
    printEnvironmentInfo();
    
    const conn = await mongoose.connect(CONFIG.DATABASE.URI, CONFIG.DATABASE.OPTIONS);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    if (CONFIG.IS_DEMO) {
      console.log('🎭 Demo database mode active');  
    }
    
    if (CONFIG.IS_LOCALHOST) {
      console.log('🏠 Local development database');
    }
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('📴 MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during MongoDB disconnection:', error);
        process.exit(1);
      }
    });
    
    return conn;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    // In demo mode, try alternative connection
    if (CONFIG.IS_DEMO && !CONFIG.DATABASE.URI.includes('demo')) {
      console.log('🔄 Attempting demo database fallback...');
      try {
        const demoConn = await mongoose.connect(
          'mongodb://localhost:27017/una-snail-mail-demo',
          { maxPoolSize: 5 }
        );
        console.log('✅ Connected to demo database');
        return demoConn;
      } catch (demoError) {
        console.error('❌ Demo database connection also failed:', demoError.message);
      }
    }
    
    process.exit(1);
  }
};

export default connectDatabase;