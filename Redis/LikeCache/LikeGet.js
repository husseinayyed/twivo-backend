
import { Like } from "../../models/like.js";

class LikeGetCache {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

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
        await this.sadd(likeKey, userId.toString());
        await this.expire(likeKey, 2592000);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error checking like status:", error);
      return false;
    }
  }

  async getTwiLikes(twiId) {
    const likeKey = `twi:likes:${twiId}`;
    try {
      const cached = await this.cache.smembers(likeKey);
      if (cached.length) return cached;

      const likes = await Like.find({ twiId }).select("likedBy");
      const userIds = likes.map((like) => like.likedBy.toString());
      if (userIds.length) {
        await this.sadd(likeKey, ...userIds);
        await this.expire(likeKey, 2592000);
      }
      return userIds;
    } catch (error) {
      console.error("Error getting twi likes:", error);
      return (await Like.find({ twiId }).select("likedBy")).map((like) =>
        like.likedBy.toString(),
      );
    }
  }

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
  }

  async batchGetLikeCounts(tweetIds) {
    try {
      const pipeline = this.client.pipeline();

      // First, check Redis for all tweets
      tweetIds.forEach((tweetId) => {
        const likeKey = `twi:likes:${tweetId}`;
        pipeline.scard(likeKey);
      });

      const results = await pipeline.exec();
      const finalResults = [];
      const tweetsToCheckInDB = [];

      // Process Redis results
      results.forEach(([err, redisCount], index) => {
        const tweetId = tweetIds[index];

        if (!err && redisCount > 0) {
          // Redis has valid count
          finalResults[index] = {
            tweetId: tweetId,
            count: redisCount,
            success: true,
            fromCache: true,
          };
        } else {
          // Redis has 0 or error - need to check DB
          tweetsToCheckInDB.push({ tweetId, index });
          finalResults[index] = {
            tweetId: tweetId,
            count: 0, // temporary
            success: false,
            fromCache: false,
          };
        }
      });

      // Check DB for tweets with cache misses
      if (tweetsToCheckInDB.length > 0) {
        const tweetIdsForDB = tweetsToCheckInDB.map((t) => t.tweetId);

        // Get counts from MongoDB in ONE query
        const dbCounts = await Like.aggregate([
          { $match: { twiId: { $in: tweetIdsForDB } } },
          { $group: { _id: "$twiId", count: { $sum: 1 } } },
        ]);

        // Create a map for quick lookup
        const dbCountsMap = {};
        dbCounts.forEach((item) => {
          dbCountsMap[item._id.toString()] = item.count;
        });

        // Update results and sync to Redis
        const redisPipeline = this.client.pipeline();

        tweetsToCheckInDB.forEach(({ tweetId, index }) => {
          const dbCount = dbCountsMap[tweetId] || 0;

          // Update final result
          finalResults[index] = {
            tweetId: tweetId,
            count: dbCount,
            success: true,
            fromCache: false,
          };

          // Sync to Redis if there are likes
          if (dbCount > 0) {
            const likeKey = `twi:likes:${tweetId}`;
            // We'll sync the actual users later
            redisPipeline.set(`twi:likes:${tweetId}:count`, dbCount);
            redisPipeline.expire(`twi:likes:${tweetId}:count`, 300); // 5 min cache
          }
        });

        await redisPipeline.exec();
      }

      return finalResults;
    } catch (error) {
      console.error(`Error in batchGetLikeCounts:`, error);

      // Fallback: get all from DB
      const dbCounts = await Like.aggregate([
        { $match: { twiId: { $in: tweetIds } } },
        { $group: { _id: "$twiId", count: { $sum: 1 } } },
      ]);

      const dbCountsMap = {};
      dbCounts.forEach((item) => {
        dbCountsMap[item._id.toString()] = item.count;
      });

      return tweetIds.map((tweetId) => ({
        tweetId: tweetId,
        count: dbCountsMap[tweetId] || 0,
        success: true,
        fromCache: false,
      }));
    }
  }

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
  }
}

export default LikeGetCache;