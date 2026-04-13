import Redis from "ioredis";
import UserCache from "../Redis/UserCache/index.js";
import TwiCache from "../Redis/TwiCache/index.js";
import LikeCache from "../Redis/LikeCache.js";
import FollowCache from "../Redis/FollowCache.js";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
console.log(`Connecting to Redis: ${redisUrl}`);

class CacheService {
  constructor() {
    this.client = new Redis(redisUrl, {
      family: 4,
      keepAlive: 10000,
      noDelay: true,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableReadyCheck: false,
    });
    this.blockingClient = new Redis(redisUrl, {
      family: 4,
      keepAlive: 10000,
      noDelay: true,
      maxRetriesPerRequest: null, // For BullMQ compatibility
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableReadyCheck: false,
      enableOfflineQueue: true, // Needed for stream operations
    });
    this.queueConnection = new Redis(redisUrl,{
      maxRetriesPerRequest: null
    }); 
    this.client.on("error", (err) => console.error("Redis error:", err));
    this.client.on("connect", () => console.log("✅ Connected to Redis server"));
    this.user = new UserCache(this.client, this);
    this.twi = new TwiCache(this.client, this);
    this.like = new LikeCache(this.client, this);
    this.follow = new FollowCache(this.client, this);
  }
}

const Cache = new CacheService();
export default Cache;
