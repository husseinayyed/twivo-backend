import { Like } from "../../models/like.js";

export const likeStatusInternalMethods = {
  async hasLiked(twiId, userId, pipeline = null) {
    const likeKey = `twi:likes:${twiId}`;
    try {
      // If pipeline provided, just add command
      if (pipeline) {
        pipeline.sismember(likeKey, userId);
        return;
      }

      // Check Redis first
      const hasLiked = await this.client.sismember(likeKey, userId);
      if (hasLiked === 1) return true;

      // Check MongoDB
      const like = await Like.findOne({ twiId, likedBy: userId });
      if (like) {
        // Sync to Redis
        await this.client.sadd(likeKey, userId.toString());
        await this.client.expire(likeKey, 2592000);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error checking like status:", error);
      return false;
    }
  },

  async batchHasLiked(tweetIds, userId) {
    const userIdStr = userId.toString();

    try {
      const pipeline = this.client.pipeline();

      // First, check Redis for all tweets
      tweetIds.forEach((tweetId) => {
        const likeKey = `twi:likes:${tweetId}`;
        pipeline.sismember(likeKey, userIdStr);
      });

      const results = await pipeline.exec();
      const finalResults = [];
      const tweetsToCheckInDB = [];

      // Process Redis results
      results.forEach(([err, redisResult], index) => {
        const tweetId = tweetIds[index];

        if (!err && redisResult === 1) {
          // Redis says liked
          finalResults[index] = {
            tweetId: tweetId,
            hasLiked: true,
            success: true,
            fromCache: true,
          };
        } else if (!err && redisResult === 0) {
          // Redis says not liked (could be accurate or missing)
          tweetsToCheckInDB.push({ tweetId, index });
          finalResults[index] = {
            tweetId: tweetId,
            hasLiked: false, // temporary
            success: false,
            fromCache: false,
          };
        } else {
          // Redis error
          tweetsToCheckInDB.push({ tweetId, index });
          finalResults[index] = {
            tweetId: tweetId,
            hasLiked: false,
            success: false,
            fromCache: false,
          };
        }
      });

      // Check DB for uncertain tweets
      if (tweetsToCheckInDB.length > 0) {
        const tweetIdsForDB = tweetsToCheckInDB.map((t) => t.tweetId);

        // Get likes from MongoDB in ONE query
        const dbLikes = await Like.find({
          twiId: { $in: tweetIdsForDB },
          likedBy: userId,
        })
          .select("twiId")
          .lean();

        // Create a set for quick lookup
        const likedTweetIds = new Set(
          dbLikes.map((like) => like.twiId.toString()),
        );

        // Update results and sync to Redis
        const redisPipeline = this.client.pipeline();

        tweetsToCheckInDB.forEach(({ tweetId, index }) => {
          const hasLiked = likedTweetIds.has(tweetId);

          // Update final result
          finalResults[index] = {
            tweetId: tweetId,
            hasLiked: hasLiked,
            success: true,
            fromCache: false,
          };

          // Sync to Redis
          const likeKey = `twi:likes:${tweetId}`;
          if (hasLiked) {
            redisPipeline.sadd(likeKey, userIdStr);
            redisPipeline.expire(likeKey, 2592000);
          }
        });

        await redisPipeline.exec();
      }

      return finalResults;
    } catch (error) {
      console.error(`Error in batchHasLiked:`, error);

      // Fallback: check DB individually
      const dbLikes = await Like.find({
        twiId: { $in: tweetIds },
        likedBy: userId,
      })
        .select("twiId")
        .lean();

      const likedTweetIds = new Set(
        dbLikes.map((like) => like.twiId.toString()),
      );

      return tweetIds.map((tweetId) => ({
        tweetId: tweetId,
        hasLiked: likedTweetIds.has(tweetId),
        success: true,
        fromCache: false,
      }));
    }
  },
};