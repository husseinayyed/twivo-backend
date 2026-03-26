import BaseCache from "./BaseCache.js";
import { User } from "../models/user.js";
import { Twi } from "../models/twi.js";
import { ObjectId } from "mongodb";

class UserCache extends BaseCache {
  constructor(client, cacheService) {
    super(client);
    this.cache = cacheService;
  }

  // ========== PUBLIC METHODS ==========

  async getUserTwis(userId, viewerId = null) {
    const start = Date.now();

    try {
      const cachedTwis = await this._getCachedUserTwis(userId);
      if (cachedTwis && cachedTwis.length > 0) {
        const enrichedTwis = await this._enrichCachedTwis(
          cachedTwis,
          userId,
          viewerId,
        );
        console.log(`✅ USER TWIS CACHE HIT: ${Date.now() - start}ms`);
        return enrichedTwis;
      }

      return await this._fetchFreshUserTwis(userId, viewerId, start);
    } catch (error) {
      console.error("Error in getUserTwis:", error);
      return await this._fetchFreshUserTwis(userId, viewerId, Date.now());
    }
  }

  async getUser(token) {
    try {
      const cachedUser = await this._getCachedUser(token);
      if (cachedUser) return cachedUser;

      return await this._fetchAndCacheUser(token);
    } catch (error) {
      console.error("Error getting user from cache:", error);
      return null;
    }
  }
  async getUserByMethod(method, token) {
    try {
      const id = await this._getCachedUserByMethod(method, token);
      let cachedUser;
      if (id) cachedUser = await this._getCachedUser(id);
      if (cachedUser) return cachedUser;
      return await this._fetchAndCacheUserByMethod(method, token);
    } catch (error) {
      console.error("Error getting user from cache:", error);
      return null;
    }
  }

  async getUsers(userIds) {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];

    try {
      return await this._batchGetUsers(userIds);
    } catch (error) {
      console.error("Error in getUsers:", error);
      return await this._fetchUsersFromDB(userIds);
    }
  }

  // ========== USER TWIS METHODS ==========
  async addTwiToPendingList(twiId,text) {
    try {
      const twi = {
        _id: twiId.toString(),
        text: text,
      };
      await this.addTwiToUserCache(twi);
      return true;
    } catch (error) {
      return null;
    }
  }
  async addTwiToUserCache(twi, age = 300) {
    try {
      const tweetId = twi._id;
      if (!tweetId) return;
      const pipeline = this.client.pipeline();
      pipeline.hset(`twi:${tweetId}`, this._createTwiCacheData(twi));
      pipeline.expire(age);
      await pipeline.exec();
    } catch (error) {
      console.error("Error adding twi to cache:", error);
    }
  }
  async _getCachedUserTwis(userId) {
    const twisKey = `user:${userId}:twis`;
    try {
      const cachedTwis = await this.client.lrange(twisKey, 0, 49);

      if (!cachedTwis || cachedTwis.length === 0) {
        return null;
      }

      return cachedTwis
        .map((json) => {
          try {
            return JSON.parse(json);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      console.error("Error getting cached user twis:", error);
      return null;
    }
  }

  async _enrichCachedTwis(twis, userId, viewerId) {
    if (!twis.length) return [];

    const tweetIds = twis.map((t) => t._id || t.twiId);
    const isSameUser = viewerId === userId;

    try {
      // BATCH ALL OPERATIONS - PARALLEL
      const [likeCounts, likedStatuses, followStatus] = await Promise.all([
        // 1. Batch like counts
        this.cache.like.batchGetLikeCounts(tweetIds),

        // 2. Batch liked status (only if viewer exists)
        viewerId
          ? this.cache.like.batchHasLiked(tweetIds, viewerId)
          : Promise.resolve(tweetIds.map(() => false)),

        // 3. Get follow status (only if different users)
        !isSameUser && viewerId
          ? this._getBatchFollowStatus(viewerId, userId)
          : Promise.resolve([false, false]),
      ]);

      // Apply results
      return twis.map((twi, index) => ({
        ...twi,
        likes: likeCounts[index]?.count || 0,
        isLiked: likedStatuses[index]?.hasLiked || false,
        isFollowing: !isSameUser ? followStatus[0] : false,
        followsYou: !isSameUser ? followStatus[1] : false,
        myself: isSameUser,
      }));
    } catch (error) {
      console.error("Error enriching cached twis:", error);

      // Fallback: minimal data
      return twis.map((twi) => ({
        ...twi,
        likes: 0,
        isLiked: false,
        isFollowing: false,
        followsYou: false,
        myself: isSameUser,
      }));
    }
  }

  async _fetchFreshUserTwis(userId, viewerId, startTime) {
    try {
      // Fetch from database
      const twis = await Twi.find({ "author.userId": userId })
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
        this.cache.like.batchGetLikeCounts(tweetIds),

        // 2. Batch liked status
        viewerId
          ? this.cache.like.batchHasLiked(tweetIds, viewerId)
          : Promise.resolve(tweetIds.map(() => false)),

        // 3. Get follow status
        !isSameUser && viewerId
          ? this._getBatchFollowStatus(viewerId, userId)
          : Promise.resolve([false, false]),
      ]);

      // Format tweets
      const finalTwis = twis.map((twi, index) => {
        const content = twi.content || {};

        return {
          _id: twi._id.toString(),
          twiId: twi._id.toString(),
          content: content,
          author: twi.author || {},
          comments: twi.comments || 0,
          createdAt: twi.createdAt,
          likes: likeCounts[index]?.count || 0,
          isLiked: likedStatuses[index]?.hasLiked || false,
          isFollowing: !isSameUser ? followStatus[0] : false,
          followsYou: !isSameUser ? followStatus[1] : false,
          myself: isSameUser,
        };
      });

      // Cache results (async, don't wait)
      this._cacheUserTwis(userId, finalTwis).catch(console.error);

      console.log(`✅ USER TWIS FRESH FETCH: ${Date.now() - startTime}ms`);
      return finalTwis;
    } catch (error) {
      console.error("Error fetching fresh user twis:", error);
      return [];
    }
  }

  async _cacheUserTwis(userId, twis) {
    if (!twis.length) return;

    const twisKey = `user:${userId}:twis`;

    try {
      const pipeline = this.client.pipeline();

      // Clear existing list
      pipeline.del(twisKey);

      // Add tweets
      for (const twi of twis) {
        pipeline.rpush(twisKey, JSON.stringify(twi));

        // Cache individual tweet
        const tweetId = twi._id;
        if (tweetId) {
          pipeline.hset(`twi:${tweetId}`, this._createTwiCacheData(twi));
          pipeline.expire(`twi:${tweetId}`, 300);
        }
      }

      // Set list limits and expiry
      pipeline.ltrim(twisKey, 0, 49);
      pipeline.expire(twisKey, 300);

      await pipeline.exec();
    } catch (error) {
      console.error("Error caching user twis:", error);
    }
  }

  // ========== USER METHODS ==========

  async _getCachedUser(token) {
    const userKey = `user:${token}`;

    try {
      const exists = await this.exists(userKey);
      if (!exists) return null;

      const cached = await this.hgetall(userKey);
      if (!cached?.username) return null;

      return this._formatCachedUser(cached, token);
    } catch (error) {
      console.error("Error getting cached user:", error);
      return null;
    }
  }
  async _getCachedUserByMethod(method = "email", token) {
    const userKey =
      method == "email" ? `user:email:${token}` : `user:username:${token}`;
    try {
      const exists = await this.exists(userKey);
      if (!exists) return null;
      const cached = await this.client.get(userKey);
      return cached;
    } catch (error) {
      console.error("Error getting cached user:", error);
      return null;
    }
  }
  async _fetchAndCacheUser(token) {
    try {
      const user = await User.findById(token);
      if (!user) return null;

      const userData = this._formatCachedUser(user);

      // Cache asynchronously
      this.cacheUserData(userData).catch(console.error);

      return userData;
    } catch (error) {
      console.error("Error fetching user:", error);
      return null;
    }
  }
  async _fetchAndCacheUserByMethod(method = "email", token) {
    try {
      let user;
      if (method == "email") user = await User.findOne({ email: token });
      else user = await User.findOne({ username: token });
      if (!user) return null;

      const userData = this._formatCachedUser(user);

      // Cache asynchronously
      this.cacheUserData(userData).catch(console.error);

      return userData;
    } catch (error) {
      console.error("Error fetching user:", error);
      return null;
    }
  }

  async _batchGetUsers(userIds) {
    try {
      // Try Redis first with pipeline
      const pipeline = this.client.pipeline();
      userIds.forEach((id) => pipeline.get(`user:${id}`));
      const results = await pipeline.exec();

      const users = [];
      const missingIds = [];

      for (let i = 0; i < results.length; i++) {
        const [err, cached] = results[i];
        if (!err && cached) {
          try {
            users.push(JSON.parse(cached));
          } catch {
            missingIds.push(userIds[i]);
          }
        } else {
          missingIds.push(userIds[i]);
        }
      }

      // Fetch missing users
      if (missingIds.length > 0) {
        const dbUsers = await this._fetchUsersFromDB(missingIds);
        users.push(...dbUsers);
      }

      return users;
    } catch (error) {
      console.error("Error in batchGetUsers:", error);
      throw error;
    }
  }

  async _fetchUsersFromDB(userIds) {
    try {
      const dbUsers = await User.find({ _id: { $in: userIds } }).lean();

      const users = dbUsers.map((user) => ({
        ...this._formatCachedUser(user),
      }));

      // Cache asynchronously
      if (users.length > 0) {
        const cachePipeline = this.client.pipeline();
        users.forEach((user) => {
          cachePipeline.setex(`user:${user._id}`, 604800, JSON.stringify(user));
        });
        cachePipeline.exec().catch(console.error);
      }

      return users;
    } catch (error) {
      console.error("Error fetching users from DB:", error);
      return [];
    }
  }

  // ========== HELPER METHODS ==========

  async _getBatchFollowStatus(viewerId, userId) {
    if (!viewerId || viewerId === userId) {
      return [false, false];
    }

    try {
      // Use batch method if available, otherwise individual
      if (this.cache.follow.batchIsFollowing) {
        const results = await Promise.all([
          this.cache.follow.batchIsFollowing(viewerId, [userId]),
          this.cache.follow.batchIsFollowing(userId, [viewerId]),
        ]);

        return [
          results[0][0]?.isFollowing || false,
          results[1][0]?.isFollowing || false,
        ];
      } else {
        // Fallback to individual calls
        const [isFollowing, followsYou] = await Promise.all([
          this.cache.follow.isFollowing(viewerId, userId),
          this.cache.follow.isFollowing(userId, viewerId),
        ]);
        return [isFollowing, followsYou];
      }
    } catch (error) {
      console.error("Error getting batch follow status:", error);
      return [false, false];
    }
  }

 _createTwiCacheData(twi) {
    return {
        id: twi._id?.toString() || "",
        madeBy: twi.madeBy?.toString() || "",
        text: twi.text || "",
        likes: (twi.likes ?? 0).toString(),
        comments: (twi.comments ?? 0).toString(),
        attachment: (twi.attachment ?? false).toString(),
        image: twi.image || "",
        aspectClass: twi.aspectClass || "",
        createdAt: twi.createdAt?.toISOString() || new Date().toISOString(),
    };
}

  async cacheUserData(user) {
    try {
      const userKey = `user:${user._id}`;
      const userFields = this._formatCachedUser(user);
      const pipeline = this.client.pipeline();
      pipeline.hset(userKey, 604800, ...Object.entries(userFields).flat());
      pipeline.set(`user:username:${user.username}`, user._id, "EX", 604800);
      pipeline.set(`user:email:${user.email}`, user._id, "EX", 604800);
      await pipeline.exec();
    } catch (error) {
      console.error("Error caching user data:", error);
    }
  }

  _formatCachedUser(user) {
    return {
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      isVerified: user.isVerified || false,
      image: user.image,
      bio: user.bio,
      refreshToken: user.refreshToken || null,
      createdAt: user.createdAt,
    };
  }
}

export default UserCache;
