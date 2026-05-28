import { Like } from "../../models/like.js";

export const likeStatusInternalMethods = {
  async hasLiked(twiId, userId, pipeline = null) {
    const userIdStr = userId.toString();
    const twiIdStr = twiId.toString();

    // Switch to user-centric check for consistency and performance
    const userLikesKey = `user:${userIdStr}:likes`;

    try {
      if (pipeline) {
        pipeline.sismember(userLikesKey, twiIdStr);
        return;
      }

      // Check if user's likes are cached
      const pipeline = this.client.pipeline();
      pipeline.exists(userLikesKey);
      pipeline.exists(`${userLikesKey}:loaded`);
      const [[err1, isCached], [err2, isLoadedFlag]] = await pipeline.exec();
      if (isCached === 0 && isLoadedFlag === 0) {
        // Cache miss: Load all user likes
        await this.cache.like.set.syncUserLikesToCache(userIdStr);
      }

      const result = await this.client.sismember(userLikesKey, twiIdStr);
      return result === 1;
    } catch (error) {
      console.error("Error checking like status:", error);
      return false;
    }
  },

  async batchHasLiked(rawTweets, userId) {
    const tweetIds = rawTweets.map((t) => (t._id || t.id || t).toString());
    const userIdStr = userId.toString();
    const userLikesKey = `user:${userIdStr}:likes`;

    try {
      // 1. Ensure user's like set is in cache
      const isCached = await this.client.exists(userLikesKey);
      const isLoadedFlag =
        isCached === 0 ? await this.client.exists(`${userLikesKey}:loaded`) : 1;

      if (isCached === 0 && isLoadedFlag === 0) {
        // Cache miss: Load all user likes into Redis once
        await this.cache.like.set.syncUserLikesToCache(userIdStr);
      }

      // 2. Perform high-performance pipelined SISMEMBER checks against the USER set
      // This is extremely fast because it's O(1) per tweet and hits only ONE set key
      const pipeline = this.client.pipeline();
      tweetIds.forEach((tweetId) => {
        pipeline.sismember(userLikesKey, tweetId);
      });

      const results = await pipeline.exec();
      return results.map(([err, isMember]) => !err && isMember === 1);
    } catch (error) {
      console.error(`Error in batchHasLiked:`, error);
      // Fallback: Check DB for the whole batch
      const dbLikes = await Like.find({
        twiId: { $in: tweetIds },
        likedBy: userIdStr,
      })
        .select("twiId")
        .lean();

      const likedTweetIds = new Set(
        dbLikes.map((like) => like.twiId.toString()),
      );
      return tweetIds.map((id) => likedTweetIds.has(id));
    }
  },
};
