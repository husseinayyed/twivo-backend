import { Twi } from "../../models/twi.js";
import SchemaCache from "../schemas.js";

export const feedInternalMethods = {
  async _generateFreshFeed(userId, start) {
    const tweets = await Twi.aggregate([
      { $sample: { size: 20 } },
      { $sort: { createdAt: -1 } },
    ]);

    if (!tweets.length) return [];

    const genericTweets = tweets.map((t) =>
      SchemaCache.createTwiCacheData(t,
        true
      )
    );

    await this.cache.twi.set.cacheGenericFeed(genericTweets);

    const personalized = await this._addPersonalization(
      genericTweets,
      userId
    );
    return personalized;
  },

  async _addPersonalization(tweets, userId) {
    const userIdStr = userId.toString();

    const tweetIds = tweets.map((t) => t._id || t.id);
    const authorIds = tweets.map((t) => t.madeBy);

    const uniqueAuthors = [
      ...new Set(authorIds.filter((a) => a && a !== userIdStr)),
    ];

    const [likes, liked, follows] = await Promise.all([
      this.cache.like.get.batchGetLikeCounts(tweetIds),
      this.cache.like.get.batchHasLiked(tweetIds, userId),
      this.cache.follow.get.batchIsFollowing(userIdStr, uniqueAuthors),
    ]);

    const followMap = {};
    follows.forEach((f) => {
      if (f.success) followMap[f.targetUserId] = f.isFollowing;
    });

    return 
  },
};