import { Twi } from "../../models/twi.js";
import SchemaCache from "../schemas.js";
import { contentInternalMethods } from "./TwiContentInternal.js";
import { feedInternalMethods } from "./TwiFeedInternal.js";
import { protoSerializeTwi } from "../../protobuf/setup.js";
class TwiGetCache {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
    Object.assign(this, contentInternalMethods, feedInternalMethods);
  }

  // ================= PUBLIC =================

  async getContent(tweetId, userId) {
    const cached = await this._getCachedContent(tweetId, userId);
    if (cached) return cached;

    return await this._fetchFromDatabaseAndCache(tweetId, userId);
  }

  async getFeed(userId) {
    try {
      const cachedFeed = await this.client.zrange("feed:generic", 0, 19);
      let tweetIds = [];
      if (cachedFeed?.length) {
        tweetIds = cachedFeed;
          return await this._assmbleFeedItem(tweetIds, userId);
      }
      const freshFeed = await this._generateFreshFeed(userId);
      console.log(`Generated fresh feed for user ${userId}:`, freshFeed);
      if (!freshFeed?.length) return [];
      return await this._assmbleFeedItem(freshFeed, userId);
      
    } catch (err) {
      console.error("Feed error:", err);
    }
  }

  // ================= CACHE READ =================

  // ================= DB FETCH =================

  // ================= FEED =================

}

export default TwiGetCache;