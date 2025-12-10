import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize Redis client (returns null if not configured)
function getRedisClient() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const redis = getRedisClient();

// Rate limit configurations for different endpoint types
const rateLimiters = {
  // Chat endpoint - most used, moderate limit
  chat: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 requests per minute
    analytics: true,
    prefix: 'ratelimit:chat',
  }) : null,

  // Upload endpoint - resource intensive
  upload: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, '1 m'), // 50 uploads per minute
    analytics: true,
    prefix: 'ratelimit:upload',
  }) : null,

  // Generate endpoints (quiz, report, podcast, etc.) - expensive operations
  generate: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 generations per minute
    analytics: true,
    prefix: 'ratelimit:generate',
  }) : null,

  // Web scraping/search - external API calls
  web: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(15, '1 m'), // 15 requests per minute
    analytics: true,
    prefix: 'ratelimit:web',
  }) : null,

  // Default/general API calls
  default: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1 m'), // 60 requests per minute
    analytics: true,
    prefix: 'ratelimit:default',
  }) : null,
};

/**
 * Check rate limit for a user
 * @param {string} userId - The user ID to check
 * @param {string} type - The type of rate limit ('chat', 'upload', 'generate', 'web', 'default')
 * @returns {Promise<{success: boolean, limit: number, remaining: number, reset: number}>}
 */
export async function checkRateLimit(userId, type = 'default') {
  const limiter = rateLimiters[type] || rateLimiters.default;

  // If rate limiting is not configured, allow all requests
  if (!limiter) {
    return {
      success: true,
      limit: -1,
      remaining: -1,
      reset: 0,
      configured: false,
    };
  }

  try {
    const result = await limiter.limit(userId);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      configured: true,
    };
  } catch (error) {
    console.error('Rate limit check error:', error.message);
    // On error, allow the request (fail open)
    return {
      success: true,
      limit: -1,
      remaining: -1,
      reset: 0,
      configured: true,
      error: error.message,
    };
  }
}

/**
 * Rate limit middleware helper - returns error response if rate limited
 * @param {object} req - Next.js request object
 * @param {object} res - Next.js response object
 * @param {string} userId - The user ID to check
 * @param {string} type - The type of rate limit
 * @returns {Promise<boolean>} - Returns true if request should proceed, false if rate limited
 */
export async function rateLimit(req, res, userId, type = 'default') {
  const result = await checkRateLimit(userId, type);

  // Set rate limit headers
  if (result.configured && result.limit > 0) {
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
    res.setHeader('X-RateLimit-Reset', result.reset);
  }

  if (!result.success) {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    res.setHeader('Retry-After', Math.max(1, retryAfter));
    res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      retryAfter,
    });
    return false;
  }

  return true;
}

/**
 * Check if rate limiting is configured
 * @returns {boolean}
 */
export function isRateLimitConfigured() {
  return redis !== null;
}

export default rateLimit;
