import Redis from "ioredis";
import RedisMock from "ioredis-mock";
import UserCache from "../cache/UserCache.js";
import TwiCache from "../cache/twiCache.js";
import LikeCache from "../cache/LikeCache.js";
import FollowCache from "../cache/FollowCache.js";
import dotenv from "dotenv"
dotenv.config()
class CacheService {
  constructor() {
    console.log(process.env.REDIS_ENV)
    this.client = process.env.REDIS_ENV == 'PRO' ? new Redis(process.env.REDIS_URL) : new RedisMock()
    this.client.on("error", (err) => console.error("Redis error:", err));
    this.client.on("connect", () => console.log("Connected to Redis server"));
    this.user = new UserCache(this.client,this);
    this.twi = new TwiCache(this.client,this);
    this.like = new LikeCache(this.client,this)
    this.follow = new FollowCache(this.client,this)
  }

}

const Cache = new CacheService();
export default Cache;