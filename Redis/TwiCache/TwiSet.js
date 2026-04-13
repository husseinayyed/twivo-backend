import SchemaCache from "../schemas.js";

class TwiSetCache {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

  async cacheGenericFeed(tweets) {
    const pipeline = this.client.pipeline();

    tweets.forEach((tweet) => {
      pipeline.lpush("feed:generic", JSON.stringify(tweet));

      const cacheData = SchemaCache.createTwiCacheData(
        {
          _id: tweet._id,
          madeBy: tweet.madeBy,
          text: tweet.text,
          likes: 0,
          comments: tweet.comments,
          attachment: tweet.attachment,
          image: tweet.image,
          aspectClass: tweet.aspectClass,
          createdAt: tweet.createdAt,
        },
        true
      );

      pipeline.hset(`twi:${tweet._id}`, cacheData);
      pipeline.expire(`twi:${tweet._id}`, 300);
    });

    pipeline.ltrim("feed:generic", 0, 19);
    pipeline.expire("feed:generic", 300);

    await pipeline.exec();
  }

  async addToFeedCache(twi) {
    try {
      const cacheData = SchemaCache.createTwiCacheData(twi, true);
      await this.client.lpush("feed:generic", JSON.stringify(cacheData));
    } catch (err) {
      console.error("Error adding to feed:", err);
    }
  }

  async clearFeedCache() {
    try {
      await this.client.del("feed:generic");
    } catch (err) {
      console.error("Error clearing feed:", err);
    }
  }
}

export default TwiSetCache;