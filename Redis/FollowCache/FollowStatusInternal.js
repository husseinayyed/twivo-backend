import { Follow } from "../../models/follow.js";

export const followStatusInternalMethods = {
  async isFollowing(userId, targetUserId, pipeline = null) {
    const userIdStr = userId.toString();
    const targetIdStr = targetUserId.toString();
    const followingKey = `user:${userIdStr}:following`;

    if (pipeline) {
      pipeline.sismember(followingKey, targetIdStr);
      return;
    }

    try {
      // 1. Ensure user's following set is in cache
      const isCached = await this.client.exists(followingKey);
      const isLoadedFlag = isCached === 0 ? await this.client.exists(`${followingKey}:loaded`) : 1;

      if (isCached === 0 && isLoadedFlag === 0) {
        // Cache miss: Load all following IDs for this user
        await this.cache.follow.set.syncFollowingToCache(userIdStr);
      }

      // 2. Trust Redis O(1) result
      const result = await this.client.sismember(followingKey, targetIdStr);
      return result === 1;
    } catch (error) {
      console.error("Error checking follow status:", error);
      return false;
    }
  },

  async getBatchFollowStatus(viewerId, userId) {
    if (!viewerId || viewerId === userId) {
      return [false, false];
    }

    try {
      // Parallel check: Does viewer follow author? AND Does author follow viewer?
      const [isFollowing, followsYou] = await Promise.all([
        this.isFollowing(viewerId, userId),
        this.isFollowing(userId, viewerId)
      ]);
      
      return [isFollowing, followsYou];
    } catch (error) {
      console.error("Error getting batch follow status:", error);
      return [false, false];
    }
  },

 async batchIsFollowing(userId, targetUserIds) {
  if (!targetUserIds.length) return [];
  
  const userIdStr = userId.toString();
  const followingKey = `user:${userIdStr}:following`;

  try {
    // 1. Ensure user's following set is in cache
    const isCached = await this.client.exists(followingKey);
    const isLoadedFlag = isCached === 0 ? await this.client.exists(`${followingKey}:loaded`) : 1;

    if (isCached === 0 && isLoadedFlag === 0) {
      // Cache miss: Load ALL following for this user into Redis once
      await this.cache.follow.set.syncFollowingToCache(userIdStr);
    }

    // 2. Perform high-performance pipelined SISMEMBER checks
    const pipeline = this.client.pipeline();
    targetUserIds.forEach((targetId) => {
      pipeline.sismember(followingKey, targetId.toString());
    });

    const results = await pipeline.exec();
    return results.map(([err, isMember]) => !err && isMember === 1);

  } catch (error) {
    console.error(`Error in batchIsFollowing:`, error);
    // Fallback: DB check for the whole batch
    const dbFollows = await Follow.find({
      follower: userId,
      following: { $in: targetUserIds },
    }).select("following").lean();

    const followingSet = new Set(dbFollows.map(f => f.following.toString()));
    return targetUserIds.map(id => followingSet.has(id.toString()));
  }
}
};