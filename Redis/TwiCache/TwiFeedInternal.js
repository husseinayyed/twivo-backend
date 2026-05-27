import { Twi } from "../../models/twi.js";
import SchemaCache from "../schemas.js";

export const feedInternalMethods = {
  /**
   * 1. Generates fresh feed, caches it, fetches metadata, and returns the personalized result directly.
   */
  async _generateFreshFeed(userId) {
    const tweets = await Twi.aggregate([
      { $sample: { size: 20 } },
      { $sort: { createdAt: -1 } },
    ]);

    if (!tweets.length) {
      return { twis: [], likes: [], liked: [], followMap: [] };
    }

    // Format and cache items
    const genericTweets = tweets.map((t) => SchemaCache.createTwiCacheData(t));
    await this.cache.twi.set.cacheGenericFeed(genericTweets);

    const freshIds = tweets.map((t) => t._id.toString());

    // Safely pull the metadata hashes for these fresh items just like the assembler does
    const metaData = await this._fetchMetaData(freshIds);

    // Call personalization directly and return its result
    return await this._addPersonalization(freshIds, userId, metaData);
  },

  /**
   * 2. Reusable metadata harvester to prevent undefined errors
   * OPTIMIZED: Uses a Redis pipeline to fetch all meta hashes in one roundtrip
   */
  async _fetchMetaData(rawTweetIds) {
    if (!rawTweetIds || !rawTweetIds.length) return [];
    
    const pipeline = this.client.pipeline();
    rawTweetIds.forEach(id => pipeline.hgetall(`twi:meta:${id}`));
    const results = await pipeline.exec();

    return results.map(([err, meta]) => ({
      likes: meta?.likes || "0",
      comments: meta?.comments || "0",
      madeBy: meta?.madeBy || ""
    }));
  },

  /**
   * 3. Personalization Layer: Processes relations and returns the FINAL assembled feed object.
   * OPTIMIZED: Parallelizes metadata and buffer fetching to reduce wait time
   */
  async _addPersonalization(tweetIds, userId, metaData) {
    const userIdStr = userId.toString();
    
    // Fallback protection to ensure metaData mapping never fails
    const safeMeta = metaData && metaData.length ? metaData : tweetIds.map(() => ({ likes: "0", comments: "0", madeBy: "" }));

    const authorIds = safeMeta.map((meta) => meta?.madeBy);
    const uniqueAuthors = [
      ...new Set(authorIds.filter((a) => a && a !== userIdStr)),
    ];

    // High-performance parallel caching queries
    const [likedData, followsArray, buffers] = await Promise.all([
      this.cache.like.get.batchHasLiked(tweetIds, userId),
      uniqueAuthors.length > 0 
        ? this.cache.follow.get.batchIsFollowing(userIdStr, uniqueAuthors)
        : Promise.resolve([]),
      this.client.mgetBuffer(tweetIds.map(id => `twi:${id}`))
    ]);

    // O(1) Follow lookup dictionary
    const followLookup = {};
    uniqueAuthors.forEach((authorId, index) => {
      followLookup[authorId] = followsArray[index] || false;
    });

    const followMapData = authorIds.map((authorId) => {
      if (!authorId || authorId === userIdStr) return false;
      return followLookup[authorId] || false;
    });

    const likesData = safeMeta.map(meta => parseInt(meta.likes, 10));
    const commentsData = safeMeta.map(meta => parseInt(meta.comments, 10));

    // Returns the complete unified result as requested
    return {
      twis: buffers,
      likes: likesData,
      comments: commentsData,
      liked: likedData,     
      followMap: followMapData,
    };
  },

  /**
   * 4. Central Assembler for Cache Hits
   */
  async _assmbleFeedItem(rawTweetIds, userId) {
    if (!rawTweetIds || rawTweetIds.length === 0) {
      return { twis: [], likes: [], comments: [], liked: [], followMap: [] };
    }

    // Fetch meta data and hand over execution cleanly to personalization
    const metaData = await this._fetchMetaData(rawTweetIds);
    return await this._addPersonalization(rawTweetIds, userId, metaData);
  }
};