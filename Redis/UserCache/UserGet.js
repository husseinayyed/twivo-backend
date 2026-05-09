import SchemaCache from "../schemas.js";
import { User } from "../../models/user.js";
import { Twi } from "../../models/twi.js";
import { twisInternalMethods } from "./UserTwisInternal.js";
import { profileInternalMethods } from "./UserProfileInternal.js";

class UserGet {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
    Object.assign(this, twisInternalMethods, profileInternalMethods);
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

}

export default UserGet;