import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env.config.js';

// ============================================================================
// 1. STATE MANAGEMENT
// ============================================================================

/**
 * Singleton instance of the Redis client.
 * Using a module-level variable ensures that all parts of the application
 * share the same connection pool, preventing connection exhaustion.
 */
let client: RedisClientType | null = null;

// ============================================================================
// 2. CONNECTION LOGIC (SINGLETON PATTERN)
// ============================================================================

/**
 * getRedisClient
 *
 * Implements the Singleton pattern to ensure only one active Redis connection
 * exists throughout the application lifecycle.
 *
 * - If a connection exists and is open, it returns the existing instance.
 * - If not, it initializes a new client with an exponential backoff strategy.
 */
export const getRedisClient = async (): Promise<RedisClientType> => {
  // Return the existing client if already connected
  if (client && client.isOpen) return client;

  // Initialize a new client instance
  client = createClient({
    url: env.REDIS_URL,
    socket: {
      /**
       * Exponential Backoff Strategy:
       * Prevents the application from overwhelming the Redis server
       * during a downtime event by increasing the wait time between
       * retry attempts.
       */
      reconnectStrategy: retries => {
        if (retries > 10) {
          return new Error('Redis: Exceeded maximum reconnection attempts.');
        }
        // Wait between 100ms and 3000ms based on attempt count
        return Math.min(retries * 100, 3000);
      },
    },
  }) as RedisClientType;

  // Event Listeners for connection health monitoring
  client.on('error', err => console.error('Redis connection error:', err));
  client.on('reconnecting', () => console.log('Redis: Attempting to reconnect...'));

  // Establish connection
  await client.connect();
  console.log('✅ Redis connected successfully');

  return client;
};

// ============================================================================
// 3. UTILITY WRAPPERS
// ============================================================================

/**
 * redisGet
 * Retrieves a string value from Redis by its key.
 *
 * @param key - The unique identifier for the cached data.
 * @returns The value as a string, or null if the key does not exist.
 */
export const redisGet = async (key: string): Promise<string | null> => {
  const c = await getRedisClient();
  return c.get(key);
};

/**
 * redisSet
 * Stores a value in Redis, with optional TTL (Time-To-Live).
 *
 * @param key - The key to store the value under.
 * @param value - The data to store.
 * @param ttlSeconds - Optional duration in seconds before the key expires.
 */
export const redisSet = async (key: string, value: string, ttlSeconds?: number): Promise<void> => {
  const c = await getRedisClient();
  if (ttlSeconds) {
    // setEx atomically sets the value and the expiration time
    await c.setEx(key, ttlSeconds, value);
  } else {
    // Standard set without expiration
    await c.set(key, value);
  }
};

/**
 * redisDel
 * Removes a specific key from the Redis cache.
 *
 * @param key - The key to be removed.
 */
export const redisDel = async (key: string): Promise<void> => {
  const c = await getRedisClient();
  await c.del(key);
};

/**
 * redisExpire
 * Updates or sets an expiration timestamp for an existing key.
 *
 * @param key - The key to update.
 * @param ttlSeconds - The new expiration time in seconds.
 */
export const redisExpire = async (key: string, ttlSeconds: number): Promise<void> => {
  const c = await getRedisClient();
  await c.expire(key, ttlSeconds);
};
