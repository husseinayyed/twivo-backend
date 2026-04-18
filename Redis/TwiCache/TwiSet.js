import SchemaCache from "../schemas.js";

class TwiSetCache {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

  async cacheGenericFeed(twis) {
    const pipeline = this.client.pipeline();

    twis.forEach((twi) => {
      pipeline.lpush("feed:generic", JSON.stringify(twi));

      const cacheData = SchemaCache.createTwiCacheData(
       twi,
        true
      );

      pipeline.hset(`twi:${twi._id}`, cacheData);
      pipeline.expire(`twi:${twi._id}`, 300);
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