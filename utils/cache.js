import Redis from "ioredis";
import RedisMock from "ioredis-mock";
import UserCache from "../Redis/UserCache.js";
import TwiCache from "../Redis/TwiCache.js";
import LikeCache from "../Redis/LikeCache.js";
import FollowCache from "../Redis/FollowCache.js";
import dotenv from "dotenv"
dotenv.config()
class CacheService {
  constructor() {
  
    this.client = process.env.REDIS_ENV === 'PRO' 
      ? new Redis(process.env.REDIS_URL,{
          family: 4,
          keepAlive: 10000,
          noDelay: true
        }) 
      : new RedisMock();
    this.client.on("error", (err) => console.error("Redis error:", err));
    this.client.on("connect", () => console.log("Connected to Redis server " + process.env.REDIS_ENV));
    this.user = new UserCache(this.client,this);
    this.twi = new TwiCache(this.client,this);
    this.like = new LikeCache(this.client,this)
    this.follow = new FollowCache(this.client,this)
  }

}

const Cache = new CacheService();
export default Cache;