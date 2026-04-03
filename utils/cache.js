import Redis from "ioredis";
import UserCache from "../Redis/UserCache.js";
import TwiCache from "../Redis/TwiCache.js";
import LikeCache from "../Redis/LikeCache.js";
import FollowCache from "../Redis/FollowCache.js";
import dotenv from "dotenv";
dotenv.config();
class CacheService {
  constructor() {
    this.client = new Redis(process.env.REDIS_URL, {
      family: 4,
      keepAlive: 10000,
      noDelay: true,
    });
    this.blockingClient = new Redis(process.env.REDIS_URL, {
      family: 4,
      keepAlive: 10000,
      noDelay: true,
      maxRetriesPerRequest: null, // Add this for BullMQ compatibility
    });
    this.client.on("error", (err) => console.error("Redis error:", err));
    this.client.on("connect", () => console.log("Connected to Redis server"));
    this.user = new UserCache(this.client, this);
    this.twi = new TwiCache(this.client, this);
    this.like = new LikeCache(this.client, this);
    this.follow = new FollowCache(this.client, this);
  }
}

const Cache = new CacheService();
export default Cache;
