import mongoose from 'mongoose';
import { env } from './env.config.js';

/**
 * src/config/db.ts
 *
 * This module handles the MongoDB connection lifecycle using Mongoose.
 * It includes connection management, runtime event listeners, and
 * graceful shutdown procedures.
 */

// --- Connection Configuration ---

/**
 * Establishes a connection to the MongoDB database.
 * Uses configuration variables from environment settings.
 */
export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(env.MONGO_URI as string, {
      // Disable auto-indexing in production to improve startup performance
      autoIndex: env.NODE_ENV !== 'production',

      // Limit concurrent connections to avoid overwhelming the database instance
      maxPoolSize: 10,

      // Stop attempting to connect after 10 seconds if no server is found
      // This prevents the application from "hanging" indefinitely during boot
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`✅ Database connection successful. Connected to host: ${conn.connection.host}`);
  } catch (error) {
    // Standard error handling: Log failure and terminate process to signal startup failure
    if (error instanceof Error) {
      console.error(`❌ MongoDB connection error: ${error.message}`);
    } else {
      console.error('❌ An unknown error occurred while connecting to MongoDB.');
    }
    // Exit with failure code 1 to notify orchestration tools (e.g., Docker/PM2)
    // that the app failed to start.
    process.exit(1);
  }
};

/**
 * Runtime Event Listeners
 * Mongoose emits events that allow us to monitor connection health
 * during the application's runtime.
 */

// Monitors connectivity drops after the initial successful connection.
// Essential for observability in production environments.
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});

// Captures and logs errors that occur after the connection is established.
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB connection error (runtime):', err);
});

// --- Lifecycle Management ---

/**
 * Graceful Disconnection
 * Used during the server shutdown sequence to ensure no pending
 * operations are interrupted abruptly and sockets are closed cleanly.
 */
export const disconnectDB = async (): Promise<void> => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
};
