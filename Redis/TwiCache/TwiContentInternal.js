import { Twi } from "../../models/twi.js";
import SchemaCache from "../schemas.js";

export const contentInternalMethods = {
  async _getCachedContent(tweetId, userId) {
    const [tweetData, meta] = await Promise.all([
      this.client.getBuffer(`twi:${tweetId}`),
      this.client.hgetall(`twi:${tweetId}:meta`),
    ]);

    if (!tweetData) return null;

    const madeBy = meta?.madeBy || null;
    const [isLiked, isFollowing] = await Promise.all([
      this.cache.like.get.hasLiked(tweetId, userId),
      madeBy ? this.cache.follow.get.isFollowing(userId, madeBy) : false,
    ]);

    return {
      twi: tweetData,
      likes: parseInt(meta?.likes, 10) || 0,
      comments: parseInt(meta?.comments, 10) || 0,
      isLiked,
      isFollowing,
      myself: userId?.toString() === madeBy,
    };
  },

  async _fetchFromDatabaseAndCache(tweetId, userId) {
    const tweet = await Twi.findById(tweetId).lean();
    if (!tweet) return null;
    const authorId = tweet.madeBy;
    const [isLiked, isFollowing] = await Promise.all([
      this.cache.like.get.hasLiked(tweetId, userId),
      this.cache.follow.get.isFollowing(userId, authorId),
    ]);

    const cacheData = SchemaCache.createTwiCacheData(tweet, false);
    const binary = protoSerializeTwi(cacheData);
    const result = Buffer.from(binary);
    const pipeline = this.client.pipeline();

    // 3. Store binary and separate metadata for fast field access

    pipeline.set(`twi:${tweetId}`, result, "EX", 86400);
    pipeline.hset(
      `twi:${tweetId}:meta`,
      "madeBy",
      authorId,
      "likes",
      tweet.likes?.toString() ?? "0",
      "comments",
      tweet.comments?.toString() ?? "0"
    );
    pipeline.expire(`twi:${tweetId}:meta`, 86400);
    pipeline.lpush(`user:${authorId}:twis`, tweetId);
    pipeline.expire(`user:${authorId}:twis`, 86400); // stay for an hour

    await pipeline.exec();

    return result;
  },
};
