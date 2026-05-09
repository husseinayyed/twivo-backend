import SchemaCache from "../schemas.js";
import { Twi } from "../../models/twi.js";

export const twisInternalMethods = {
  async _enrichCachedTwis(cachedTwis, userId, viewerId) {
    if (!cachedTwis || cachedTwis.length === 0) return [];

    const tweetIds = cachedTwis.map((t) => t.id);
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
    return cachedTwis.map((twi, index) => ({
      ...twi,
      isLiked: likedStatuses[index]?.hasLiked || false,
      isFollowing: !isSameUser ? followStatus[0] : false,
      followsYou: !isSameUser ? followStatus[1] : false,
      myself: isSameUser,
    }));
  },

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
  },

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
  },
};