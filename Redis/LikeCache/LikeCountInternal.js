import { fi } from "@faker-js/faker";
import { Like } from "../../models/like.js";
import { Types } from "mongoose";
export const likeCountInternalMethods = {
  async getTwiLikeCount(twiId) {
    const likeKey = `twi:likes:${twiId}`;
    try {
      // First check if key exists in Redis
      const keyExists = await this.cache.exists(likeKey);

      if (keyExists) {
        // Key exists, get count from Redis
        const cached = await this.cache.scard(likeKey);

        // Only return cached if it's > 0
        if (cached > 0) {
          return cached;
        }
        // If cached === 0 but key exists, check MongoDB
      }

      // Key doesn't exist OR exists but is empty → check MongoDB
      const count = await Like.countDocuments({ twiId });

      if (count > 0) {
        // Sync from MongoDB to Redis
        const likes = await Like.find({ twiId }).select("likedBy");
        const userIds = likes.map((like) => like.likedBy.toString());

        if (userIds.length > 0) {
          const pipeline = this.client.pipeline();
          // Clear first to avoid duplicates
          pipeline.del(likeKey);
          pipeline.sadd(likeKey, ...userIds);
          pipeline.expire(likeKey, 2592000);
          await pipeline.exec();
        }
      }

      return count;
    } catch (error) {
      console.error("Error getting like count:", error);
      return await Like.countDocuments({ twiId });
    }
  },

async batchHasLiked(tweetIds, userId) {
  if (!tweetIds || tweetIds.length === 0) return [];

  const userIdStr = userId.toString();
  const finalResults = new Array(tweetIds.length).fill(false);
  const tweetsToCheckInDB = [];

  try {
    const pipeline = this.client.pipeline();

    // 1. Check Redis Set for user likes presence
    tweetIds.forEach((tweetId) => {
      // Assuming your write pattern adds users to a set: SADD twi:likes:{tweetId} {userId}
      pipeline.sismember(`twi:likes:${tweetId}`, userIdStr);
    });

    const redisResults = await pipeline.exec();

    redisResults.forEach(([err, isMember], index) => {
      if (!err && isMember === 1) {
        finalResults[index] = true;
      } else {
        // Cache miss or not liked yet - queue up to verify against DB
        tweetsToCheckInDB.push({ tweetId: tweetIds[index], index });
      }
    });

    // 2. Query MongoDB for Cache Misses
    if (tweetsToCheckInDB.length > 0) {
      const tweetIdsForDB = tweetsToCheckInDB.map((t) => t.tweetId);
      
      // CRITICAL FOR PERFORMANCE: Ensure Compound Index exists on { twiId: 1, likedBy: 1 }
      // CRITICAL FOR TYPE MATCHING: Cast string IDs to Mongoose ObjectIds
      const dbLikes = await Like.find({
        twiId: { $in: tweetIdsForDB.map(id => new Types.ObjectId(id)) },
        likedBy: new Types.ObjectId(userIdStr),
      })
      .select("twiId")
      .lean();

      // Create a quick O(1) lookup set of strings from the DB results
      const likedTweetStrings = new Set(dbLikes.map(like => like.twiId.toString()));

      const redisPipeline = this.client.pipeline();

      // 3. Re-align data back to the exact array positions
      tweetsToCheckInDB.forEach(({ tweetId, index }) => {
        const hasLiked = likedTweetStrings.has(tweetId.toString());
        
        finalResults[index] = hasLiked;

        // Sync back to Redis so subsequent requests hit memory instantly
        if (hasLiked) {
          const likeKey = `twi:likes:${tweetId}`;
          redisPipeline.sadd(likeKey, userIdStr);
          redisPipeline.expire(likeKey, 3600); // 1-hour sliding window TTL
        }
      });

      await redisPipeline.exec();
    }

    return finalResults;

  } catch (error) {
    console.error(`Error in batchHasLiked:`, error);

    // Fallback: Query DB cleanly without breaking the response structure
    try {
      const dbLikes = await Like.find({
        twiId: { $in: tweetIds.map(id => new Types.ObjectId(id)) },
        likedBy: new Types.ObjectId(userIdStr),
      }).select("twiId").lean();

      const likedTweetStrings = new Set(dbLikes.map(like => like.twiId.toString()));
      return tweetIds.map(id => likedTweetStrings.has(id.toString()));
    } catch (fallbackError) {
      return new Array(tweetIds.length).fill(false); // Fail safely with non-liked states
    }
  }
}
};