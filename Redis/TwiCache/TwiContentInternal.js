import { Twi } from "../../models/twi.js";
import SchemaCache from "../schemas.js";

export const contentInternalMethods = {
  async _getCachedContent(tweetId, userId) {
    const tweetData = await this.client.hgetall(`twi:${tweetId}`);
    if (!tweetData || !tweetData.id) return null;

    const [isLiked, isFollowing] = await Promise.all([
      this.cache.like.get.hasLiked(tweetId, userId),
      tweetData.madeBy
        ? this.cache.follow.get.isFollowing(userId, tweetData.madeBy)
        : false,
    ]);

    return {
      _id: tweetData.id,
      text: tweetData.text || "",
      likes: parseInt(tweetData.likes) || 0,
      comments: parseInt(tweetData.comments) || 0,
      attachment: tweetData.attachment === "true",
      image: tweetData.image || "",
      aspectClass: tweetData.aspectClass || "",
      createdAt: tweetData.createdAt,
      madeBy: tweetData.madeBy || "",
      isLiked,
      isFollowing,
      myself: userId === tweetData.madeBy,
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

    const cacheData = SchemaCache.createTwiCacheData(
      tweet,
      true
    );

    const pipeline = this.client.pipeline();

    pipeline.hset(`twi:${tweetId}`, cacheData);
    pipeline.expire(`twi:${tweetId}`, 300);

    pipeline.lpush(`user:${authorId}:twis`, JSON.stringify(cacheData));
    pipeline.ltrim(`user:${authorId}:twis`, 0, 49);
    pipeline.expire(`user:${authorId}:twis`, 300);

    await pipeline.exec();

    return {
      ...cacheData,
      isLiked,
      isFollowing,
      myself: userId === authorId,
    };
  },
};