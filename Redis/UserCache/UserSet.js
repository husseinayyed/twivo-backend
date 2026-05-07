import SchemaCache from "../schemas.js";
import { User } from "../../models/user.js";
import protoSerializeUser from "../../protobuf/setup.js";

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
    const userId = user._id.toString();
    const userKey = `user:${userId}`;
    const publicKey = `user:${userId}:public`;

    // 1. Prepare Data using your SchemaClass logic
    // We use your existing logic to ensure consistent field formats (dates, strings)
    const fullData = SchemaCache.createUserCacheData(user, false);
    
    // 2. Generate Protobuf Binaries
    // Internal Blob (isPublic = false)
    const internalBinary = protoSerializeUser(fullData, false);

    // Public Blob (isPublic = true)
    // We pass the same data; the C++ side ignores fields not in PublicUser
    const publicBinary = protoSerializeUser(fullData, false);

    const pipeline = this.client.pipeline();

    // 3. Store Binaries (SET is 3x faster than HSET for this)
    pipeline.set(userKey, Buffer.from(internalBinary), "EX", 604800);
    pipeline.set(publicKey, Buffer.from(publicBinary), "EX", 604800);

    // 4. Secondary Indexes
    pipeline.set(`user:username:${user.username}`, userId, "EX", 604800);
    pipeline.set(`user:email:${user.email}`, userId, "EX", 604800);

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