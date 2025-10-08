/**
 * Simple rate limiter using Upstash Redis when available with in-memory fallback.
 */

import { Redis } from '@upstash/redis';

let redis = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
}

const memoryBuckets = new Map();

export async function rateLimit(key, { windowSec = 60, limit = 60 } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowKey = `rl:${key}:${Math.floor(nowSec / windowSec)}`;

  try {
    if (redis) {
      const current = await redis.incr(windowKey);
      if (current === 1) {
        await redis.expire(windowKey, windowSec);
      }
      return current <= limit;
    }
  } catch (_) {
    // fall through to memory
  }

  // In-memory fallback
  const bucket = memoryBuckets.get(windowKey) || { count: 0, expiresAt: nowSec + windowSec };
  if (bucket.expiresAt <= nowSec) {
    bucket.count = 0;
    bucket.expiresAt = nowSec + windowSec;
  }
  bucket.count += 1;
  memoryBuckets.set(windowKey, bucket);
  return bucket.count <= limit;
}

