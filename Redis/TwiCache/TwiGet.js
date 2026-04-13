import { Twi } from "../../models/twi.js";
import SchemaCache from "../schemas.js";

class TwiGetCache {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

  // ================= PUBLIC =================

  async getContent(tweetId, userId) {
    const cached = await this._getCachedContent(tweetId, userId);
    if (cached) return cached;

    return await this._fetchFromDatabaseAndCache(tweetId, userId);
  }

  async getFeed(userId) {
    const start = Date.now();

    try {
      const cachedFeedJson = await this.client.lrange("feed:generic", 0, 19);

      if (cachedFeedJson?.length) {
        const genericFeeds = cachedFeedJson
          .map((j) => {
            try {
              return JSON.parse(j);
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        const personalized = await this._addPersonalization(
          genericFeeds,
          userId
        );

        console.log(`✅ CACHE HIT: ${Date.now() - start}ms`);
        return personalized;
      }

      return await this._generateFreshFeed(userId, start);
    } catch (err) {
      console.error("Feed error:", err);
      return await this._generateFreshFeed(userId, Date.now());
    }
  }

  // ================= CACHE READ =================

  async _getCachedContent(tweetId, userId) {
    const tweetData = await this.client.hgetall(`twi:${tweetId}`);
    if (!tweetData || !tweetData.id) return null;

    const [isLiked, isFollowing] = await Promise.all([
      this.cache.like.hasLiked(tweetId, userId),
      tweetData.madeBy
        ? this.cache.follow.isFollowing(userId, tweetData.madeBy)
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
  }

  // ================= DB FETCH =================

  async _fetchFromDatabaseAndCache(tweetId, userId) {
    const tweet = await Twi.findById(tweetId).lean();
    if (!tweet) return null;

    const authorId = tweet.madeBy?.toString();
    if (!authorId) return null;

    const [isLiked, isFollowing] = await Promise.all([
      this.cache.like.hasLiked(tweetId, userId),
      this.cache.follow.isFollowing(userId, authorId),
    ]);

    const cacheData = SchemaCache.createTwiCacheData(
      {
        _id: tweet._id,
        madeBy: authorId,
        text: tweet.content?.text,
        likes: tweet.likes,
        comments: tweet.comments,
        attachment: tweet.content?.attachment,
        image: tweet.content?.image,
        aspectClass: tweet.content?.aspectClass,
        createdAt: tweet.createdAt,
      },
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
  }

  // ================= FEED =================

  async _generateFreshFeed(userId, start) {
    const tweets = await Twi.aggregate([
      { $sample: { size: 20 } },
      { $sort: { createdAt: -1 } },
    ]);

    if (!tweets.length) return [];

    const genericTweets = tweets.map((t) =>
      SchemaCache.createTwiCacheData(
        {
          _id: t._id,
          madeBy: t.madeBy,
          text: t.text,
          likes: 0,
          comments: 0,
          attachment: t.attachment,
          image: t.image,
          aspectClass: t.aspectClass,
          createdAt: t.createdAt,
        },
        true
      )
    );

    await this.cache.twi.set.cacheGenericFeed(genericTweets);

    const personalized = await this._addPersonalization(
      genericTweets,
      userId
    );

    console.log(`✅ FRESH FEED: ${Date.now() - start}ms`);
    return personalized;
  }

  async _addPersonalization(tweets, userId) {
    const userIdStr = userId.toString();

    const tweetIds = tweets.map((t) => t._id);
    const authorIds = tweets.map((t) => t.madeBy);

    const uniqueAuthors = [
      ...new Set(authorIds.filter((a) => a && a !== userIdStr)),
    ];

    const [likes, liked, follows] = await Promise.all([
      this.cache.like.batchGetLikeCounts(tweetIds),
      this.cache.like.batchHasLiked(tweetIds, userId),
      this.cache.follow.batchIsFollowing(userIdStr, uniqueAuthors),
    ]);

    const followMap = {};
    follows.forEach((f) => {
      if (f.success) followMap[f.targetUserId] = f.isFollowing;
    });

    return tweets.map((t, i) => ({
      ...t,
      likes: likes[i]?.count || 0,
      isLiked: liked[i]?.hasLiked || false,
      isFollowing: followMap[authorIds[i]] || false,
      myself: userIdStr === authorIds[i],
    }));
  }
}

export default TwiGetCache;