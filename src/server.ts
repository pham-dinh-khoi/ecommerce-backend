/**
 * src/server.ts
 *
 * This is the entry point for the Node.js/Express application.
 * It is responsible for initializing the database connection, starting the HTTP server,
 * and managing the application's lifecycle (graceful shutdowns and global error handling).
 */

// --- Imports ---
import { env } from './config/env.config.js';
import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';

/**
 * Bootstraps the application.
 * Connects to the database and starts the Express server.
 */
const startServer = async () => {
  // Establish connection to the database before listening for requests
  await connectDB();

  // Start the HTTP server
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 The server is running at http://localhost:${env.PORT}`);
  });

  /**
   * Graceful Shutdown Utility
   * Ensures that connections are closed properly before the process exits.
   * This is crucial for cloud environments (Render, Railway, Kubernetes) that send
   * termination signals (SIGTERM/SIGINT) during deployments or scaling events.
   */
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} signal received, initiating graceful shutdown...`);

    // Stop accepting new HTTP requests
    server.close(async () => {
      console.log('HTTP server closed.');

      // Close database connections to prevent memory leaks or dangling sessions
      await disconnectDB();
      process.exit(0);
    });

    // Force exit safety net:
    // If the server doesn't close gracefully within 10 seconds, force terminate the process.
    setTimeout(() => {
      console.error('Could not close connections in time, forcing shutdown.');
      process.exit(1);
    }, 10000);
  };

  // Listen for termination signals from the operating system
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  /**
   * Global Error Handling
   * Catches errors that were not caught within the application logic,
   * preventing the process from entering an undefined state.
   */

  // Handles Promise rejections that have no .catch() block
  process.on('unhandledRejection', reason => {
    console.error('Unhandled Rejection:', reason);
    // Depending on the severity, you might want to log this to an external service (Sentry, etc.)
  });

  // Handles synchronous errors that were not caught in try/catch blocks
  process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
    // Fatal error detected; it is unsafe to keep the application running, so we exit.
    process.exit(1);
  });
};

// Initiate the server startup
startServer();
