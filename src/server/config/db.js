const mongoose = require('mongoose');

/**
 * Establishes a connection to MongoDB.
 * Uses the MONGODB_URI environment variable.
 * Falls back to a local database named "portflow" for development.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/portflow';

  try {
    await mongoose.connect(uri);
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

module.exports = connectDB;
