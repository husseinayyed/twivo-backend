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
      if (cachedFeed?.length) {
        return await this._assmbleFeedItem(cachedFeed, userId);
      }

      const freshFeed = await this._generateFreshFeed(userId);
      if (!freshFeed || !freshFeed.twis || freshFeed.twis.length === 0) {
        return { twis: [], likes: [], liked: [], followMap: [] };
      }
      return freshFeed;
      
    } catch (err) {
      console.error("Feed error:", err);
      return { twis: [], likes: [], liked: [], followMap: [] };
    }
  }

  // ================= CACHE READ =================

  // ================= DB FETCH =================

  // ================= FEED =================


}

export default TwiGetCache;