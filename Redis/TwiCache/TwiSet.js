import SchemaCache from "../schemas.js";
import { protoSerializeTwi } from "../../protobuf/setup.js";

class TwiSetCache {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
    // تخصيص TTL للمفاتيح الفردية لمنع الـ Memory Leaks (يوم واحد ثانية)
    this.ITEM_TTL = 86400; 
  }

  async cacheGenericFeed(twis) {
    if (!twis || !twis.length) return;

    const pipeline = this.client.pipeline();

    twis.forEach((twi) => {
      const score = twi.createdAt ? new Date(twi.createdAt).getTime() : Date.now();
      this._cacheFeedItem(twi, pipeline, score);
    });

    // الحفاظ على أحدث 20 عنصرًا بدقة متناهية ومسح ما دون ذلك
    pipeline.zremrangebyrank("feed:generic", 0, -21);
    pipeline.expire("feed:generic", 300); // 5 دقائق صلاحية الـ Feed العام

    await pipeline.exec();
  }

  async addToFeedCache(twi) {
    try {
      const pipeline = this.client.pipeline();
      const score = twi.createdAt ? new Date(twi.createdAt).getTime() : Date.now();
      
      this._cacheFeedItem(twi, pipeline, score);
      await pipeline.exec();
    } catch (err) {
      console.error("Error adding to feed:", err);
    }
  }

  _cacheFeedItem(twi, pipeline, score) {
    const cacheData = SchemaCache.createTwiCacheData(twi);
    const id = cacheData._id || cacheData.id || twi._id || twi.id;
    const idStr = id.toString();

    // 1. تشفير البيانات عبر Protobuf وتحويلها إلى كتل باينري متراصة
    const data = Buffer.from(protoSerializeTwi(cacheData));
    
    // 2. تحديث الـ Timeline الرئيسي مع الحفاظ على الترتيب الزمني الصارم
    pipeline.zadd("feed:generic", score, idStr);
    
    // 3. تخزين محتوى التغريدة الفردية مع تحديد TTL حتمي لحماية الذاكرة
    const tweetKey = `twi:${idStr}`;
    pipeline.setBuffer(tweetKey, data);
    pipeline.expire(tweetKey, this.ITEM_TTL);
    
    // 4. تخزين المتغيرات الديناميكية عالية الحركة فقط (تم إقصاء الـ text لتوفير المساحة)
    const metaKey = `twi:meta:${idStr}`;
    pipeline.hset(metaKey, {
      likes: String(twi.likes || 0),
      comments: String(twi.comments || 0),
      madeBy: twi.madeBy ? twi.madeBy.toString() : "",
    });
    pipeline.expire(metaKey, this.ITEM_TTL);
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