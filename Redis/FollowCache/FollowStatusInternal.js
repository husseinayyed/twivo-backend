import { Follow } from "../../models/follow.js";

export const followStatusInternalMethods = {
  async isFollowing(userId, targetUserId, pipeline = null) {
    const followingKey = `user:${userId}:following`;

    if (pipeline) {
      // Just add the command to pipeline
      pipeline.sismember(followingKey, targetUserId);
      return; // Don't return anything when pipeline is used
    }

    // Regular execution without pipeline
    const result = await this.client.sismember(followingKey, targetUserId);
    if (result === 1) return true;

    // Check database
    const follow = await Follow.findOne({
      follower: userId,
      following: targetUserId,
    }).lean();

    if (follow) {
      // Cache result
      const cachePipeline = this.client.pipeline();
      cachePipeline.sadd(followingKey, targetUserId);
      cachePipeline.sadd(`user:${targetUserId}:followers`, userId);
      cachePipeline.expire(followingKey, 300);
      cachePipeline.expire(`user:${targetUserId}:followers`, 300);
      await cachePipeline.exec();
      return true;
    }

    return false;
  },

  async getBatchFollowStatus(viewerId, userId) {
    if (!viewerId || viewerId === userId) {
      return [false, false];
    }

    try {
      // Use batch method if available, otherwise individual
      if (this.batchIsFollowing) {
        const results = await Promise.all([
          this.batchIsFollowing(viewerId, [userId]),
          this.batchIsFollowing(userId, [viewerId]),
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
  },

 async batchIsFollowing(userId, targetUserIds) {
  if (!targetUserIds.length) return [];
  
  const userIdStr = userId.toString();
  const finalResults = new Array(targetUserIds.length).fill(false);
  const targetsToCheckInDB = [];

  try {
    const pipeline = this.client.pipeline();

    // 1. Batch check Redis
    targetUserIds.forEach((targetId) => {
      pipeline.sismember(`user:${userIdStr}:following`, targetId.toString());
    });

    const results = await pipeline.exec();
    
    results.forEach(([err, isMember], index) => {
      if (!err && isMember === 1) {
        finalResults[index] = true;
      } else {
        // Not in cache or Redis error: mark for DB check
        targetsToCheckInDB.push({ id: targetUserIds[index], index });
      }
    });

    // 2. Batch check MongoDB for misses
    if (targetsToCheckInDB.length > 0) {
      const dbIds = targetsToCheckInDB.map(t => t.id);
      const dbFollows = await Follow.find({
        follower: userId,
        following: { $in: dbIds },
      }).select("following").lean();

      const followingSet = new Set(dbFollows.map(f => f.following.toString()));
      const redisPipeline = this.client.pipeline();

      targetsToCheckInDB.forEach(({ id, index }) => {
        const idStr = id.toString();
        const isFollowing = followingSet.has(idStr);
        
        finalResults[index] = isFollowing;

        // 3. Update Cache
        if (isFollowing) {
          redisPipeline.sadd(`user:${userIdStr}:following`, idStr);
          redisPipeline.sadd(`user:${idStr}:followers`, userIdStr);
          // Standardize TTL (e.g., 1 hour instead of 5 mins for better hit rate)
          redisPipeline.expire(`user:${userIdStr}:following`, 3600);
        }
      });

      await redisPipeline.exec();
    }

    return finalResults;

  } catch (error) {
    console.error(`Error in batchIsFollowing:`, error);

    // FIXED FALLBACK: Ensure the fallback actually returns the correct booleans
    const dbFollows = await Follow.find({
      follower: userId,
      following: { $in: targetUserIds },
    }).select("following").lean();

    const followingSet = new Set(dbFollows.map(f => f.following.toString()));
    return targetUserIds.map(id => followingSet.has(id.toString()));
  }
}
};