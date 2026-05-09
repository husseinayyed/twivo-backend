import { Twi } from "../../models/twi.js";
import SchemaCache from "../schemas.js";
import { contentInternalMethods } from "./TwiContentInternal.js";
import { feedInternalMethods } from "./TwiFeedInternal.js";

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

  // ================= DB FETCH =================

  // ================= FEED =================

}

export default TwiGetCache;