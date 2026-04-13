import SchemaCache from "../schemas.js";
import { User } from "../../models/user.js";

class UserSet {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

  // ========== TWIS CACHE WRITE ==========

  async addTwiToPendingList(twiId, text) {
    try {
      const twi = {
        _id: twiId.toString(),
        text,
        createdAt: new Date(),
      };

      return this.cache.user.set.addTwiToUserCache(twi);
    } catch (err) {
      console.error("addTwiToPendingList error:", err);
      return null;
    }
  }

  async addTwiToUserCache(twi, age = 86400) {
    try {
      if (!twi?._id) return null;

      const key = `twi:${twi._id}`;

      const pipeline = this.client.pipeline();

      pipeline.hset(
        key,
        SchemaCache.createTwiCacheData(twi, true)
      );

      pipeline.expire(key, age);

      await pipeline.exec();

      return true;
    } catch (err) {
      console.error("addTwiToUserCache error:", err);
      return null;
    }
  }

  // ========== USER CACHE WRITE ==========

  async cacheUserData(user) {
    try {
      const userKey = `user:${user._id}`;

      const fields = SchemaCache.createUserCacheData(user, true);

      const pipeline = this.client.pipeline();

      // ❗ FIX: correct Redis usage (NO TTL inside HSET)
      pipeline.hset(userKey, ...Object.entries(fields).flat());

      pipeline.expire(userKey, 604800);

      // indexes
      pipeline.set(
        `user:username:${user.username}`,
        user._id,
        "EX",
        604800
      );

      pipeline.set(
        `user:email:${user.email}`,
        user._id,
        "EX",
        604800
      );

      await pipeline.exec();
    } catch (err) {
      console.error("cacheUserData error:", err);
    }
  }

  // ========== USER TWIS LIST CACHE ==========

  async cacheUserTwis(userId, twis) {
    if (!twis?.length) return;

    const key = `user:${userId}:twis`;

    try {
      const pipeline = this.client.pipeline();

      pipeline.del(key);

      for (const twi of twis) {
        pipeline.rpush(key, JSON.stringify(twi));

        const tweetId = twi._id;
        if (tweetId) {
          pipeline.hset(
            `twi:${tweetId}`,
            SchemaCache.createTwiCacheData(twi, true)
          );
          pipeline.expire(`twi:${tweetId}`, 300);
        }
      }

      pipeline.ltrim(key, 0, 49);
      pipeline.expire(key, 300);

      await pipeline.exec();
    } catch (err) {
      console.error("cacheUserTwis error:", err);
    }
  }

  // ========== USER DB SYNC ==========

 
}

export default UserSet;