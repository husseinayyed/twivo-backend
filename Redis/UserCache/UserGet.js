import SchemaCache from "../schemas.js";
import { User } from "../../models/user.js";
import { Twi } from "../../models/twi.js";
class UserGet {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

  // ========== PUBLIC GETTERS ==========

  async getUserTwis(userId, viewerId = null) {
    const start = Date.now();

    try {
      const cachedTwis = await this._getCachedUserTwis(userId);
      if (cachedTwis && cachedTwis.length > 0) {
        const enriched = await this._enrichCachedTwis(
          cachedTwis,
          userId,
          viewerId
        );

        console.log(`✅ USER TWIS CACHE HIT: ${Date.now() - start}ms`);
        return enriched;
      }

      return await this._fetchFreshUserTwis(userId, viewerId, start);
    } catch (err) {
      console.error("getUserTwis error:", err);
      return await this._fetchFreshUserTwis(userId, viewerId, Date.now());
    }
  }

  async getUser(token) {
    try {
      const cached = await this._getCachedUser(token);
      if (cached) return cached;

      return await this._fetchAndCacheUser(token);
    } catch (err) {
      console.error("getUser error:", err);
      return null;
    }
  }
  async getMyProfile(token) {
    try {
      const cached = await this._getCachedUser(token,true);
      if (cached) return cached;

      return await this._fetchAndCacheUser(token);
    } catch (err) {
      console.error("getUser error:", err);
      return null;
    }
  }

  async getUserByMethod(method, token) {
    try {
      const id = await this._getCachedUserByMethod(method, token);

      if (id) {
        const cached = await this._getCachedUser(id);
        if (cached) return cached;
      }

      return await this._fetchAndCacheUserByMethod(method, token);
    } catch (err) {
      console.error("getUserByMethod error:", err);
      return null;
    }
  }
  // In UserGet.js - Add this method
async getUserProfileWithStats(userId, viewerId) {
  const isSameUser = viewerId === userId;
  
  // Use single pipeline for all Redis operations
  const pipeline = this.client.pipeline();
  
  // Get user profile
  pipeline.hgetall(`user:${userId}`);
  
  // Get follow stats
  pipeline.scard(`user:${userId}:following`);
  pipeline.scard(`user:${userId}:followers`);
  
  // Get follow relationships
  if (!isSameUser) {
    pipeline.sismember(`user:${viewerId}:following`, userId);
    pipeline.sismember(`user:${userId}:following`, viewerId);
  }
  
  const results = await pipeline.exec();
  let idx = 0;
  
  // Parse user profile
  const userProfileRaw = results[idx++]?.[1];
  if (!userProfileRaw || Object.keys(userProfileRaw).length === 0) {
    return null;
  }
  
  const userProfile = SchemaCache.createUserCacheData(userProfileRaw, userId);
  const followingCount = results[idx++]?.[1] || 0;
  const followersCount = results[idx++]?.[1] || 0;
  
  let isFollowing = false;
  let followsYou = false;
  
  if (!isSameUser) {
    isFollowing = results[idx++]?.[1] === 1;
    followsYou = results[idx++]?.[1] === 1;
  }
  return {
    profile: {
      ...SchemaCache.getPublicUserData(userProfileRaw),
      myself: isSameUser,
      isFollowing,
      followsYou,
      followersCount,
      followingCount,
    }
  };
}
  async getUserBinary(userId, myself = false) {
    const key = myself ? `user:${userId}` : `user:${userId}:public`;
    let cached = await this.client.getBuffer(key);
    if (cached) return cached;

    // Fetch from DB and cache
    const user = await User.findById(userId);
    if (!user) return null;

    this.cache.user.set.cacheUserData(user).catch(console.error);

    // Now get the cached binary
    cached = await this.client.getBuffer(key);
    return cached;
  }
  async getUsers(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];

    try {
      return await this._batchGetUsers(userIds);
    } catch (err) {
      console.error("getUsers error:", err);
      return await this._fetchUsersFromDB(userIds);
    }
  }

  // ========== INTERNAL GETTERS ==========

async _fetchFreshUserTwis(userId, viewerId, startTime) {
    try {
      // Fetch from database
      const twis = await Twi.find({ madeBy: userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      if (!twis.length) return [];

      // Extract tweet IDs
      const tweetIds = twis.map((t) => t._id.toString());
      const isSameUser = viewerId === userId;

      // BATCH ALL METADATA - PARALLEL
      const [likeCounts, likedStatuses, followStatus] = await Promise.all([
        // 1. Batch like counts
        this.cache.like.get.batchGetLikeCounts(tweetIds),

        // 2. Batch liked status
        viewerId
          ? this.cache.like.get.batchHasLiked(tweetIds, viewerId)
          : Promise.resolve(tweetIds.map(() => false)),

        // 3. Get follow status
        !isSameUser && viewerId
          ? this.cache.follow.get.getBatchFollowStatus(viewerId, userId)
          : Promise.resolve([false, false]),
      ]);

      // Format tweets
      
      const finalTwis = twis.map((twi, index) => {
       
        return {
          ...SchemaCache.createTwiCacheData(twi),
          isLiked: likedStatuses[index]?.hasLiked || false,
          isFollowing: !isSameUser ? followStatus[0] : false,
          followsYou: !isSameUser ? followStatus[1] : false,
          myself: isSameUser,
        };
      });

      // Cache results (async, don't wait)
      console.log(`✅ USER TWIS FRESH FETCH: ${Date.now() - startTime}ms`);
      return finalTwis;
    } catch (error) {
      console.error("Error fetching fresh user twis:", error);
      return [];
    }
  }

  async _getCachedUserTwis(userId) {
    const key = `user:${userId}:twis`;

    const cached = await this.client.lrange(key, 0, 49);
    if (!cached?.length) return null;

    return cached
      .map((j) => {
        try {
          return JSON.parse(j);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  async _getCachedUser(token,myself = false) {
    const key = myself ? `user:${token}` : `user:${token}:public`;

    const exists = await this.client.exists(key);
    if (!exists) return null;

    const cached = await this.client.get(key);
    if (!cached?.username) return null;

    return cached;
  }

  async _getCachedUserByMethod(method, token) {
    const key =
      method === "email"
        ? `user:email:${token}`
        : `user:username:${token}`;

    const exists = await this.client.exists(key);
    if (!exists) return null;

    return await this.client.get(key);
  }

  async _batchGetUsers(userIds) {
    const pipeline = this.client.pipeline();
    userIds.forEach((id) => pipeline.get(`user:${id}`));

    const results = await pipeline.exec();

    const users = [];
    const missing = [];

    for (let i = 0; i < results.length; i++) {
      const [err, data] = results[i];

      if (!err && data) {
        try {
          users.push(JSON.parse(data));
        } catch {
          missing.push(userIds[i]);
        }
      } else {
        missing.push(userIds[i]);
      }
    }

    if (missing.length) {
      const dbUsers = await this._fetchUsersFromDB(missing);
      users.push(...dbUsers);
    }

    return users;
  }

  async _fetchUsersFromDB(userIds) {
    const dbUsers = await User.find({ _id: { $in: userIds } }).lean();

    return dbUsers.map((u) => ({
      ...SchemaCache.createUserCacheData(u),
    }));
  }
   async _fetchAndCacheUser(token) {
    try {
      const user = await User.findById(token);
      if (!user) return null;

      this.cache.user.set.cacheUserData(user).catch(console.error);

      return user;
    } catch (err) {
      console.error("_fetchAndCacheUser error:", err);
      return null;
    }
  }

  async _fetchAndCacheUserByMethod(method, token) {
    try {
      let user;

      if (method === "email") {
        user = await User.findOne({ email: token });
      } else {
        user = await User.findOne({ username: token });
      }

      if (!user) return null;

      this.cache.user.set.cacheUserData(user).catch(console.error);

      return user; // ❗ FIXED (was userData bug)
    } catch (err) {
      console.error("_fetchAndCacheUserByMethod error:", err);
      return null;
    }
  }
}

export default UserGet;