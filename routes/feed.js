// routes/feed.js - FIXED
import jwtAuth from "../middleware/jwt.js";
import compileColumnarFeedLEAligned from "../protobuf/src/protocol.js";
import Cache from "../utils/cache.js";
import { LikeSchema } from "./schemas/feedSchemas.js";
import { likeQueue } from "../queue/Twi/Like.js";
async function feedRoutes(fastify, options) {
  
  // GET /all
  fastify.get("/all", { preHandler: [jwtAuth] }, async (req, res) => {
    try {
      const { twis, likes, comments, liked, followMap } = await Cache.twi.get.getFeed(req.user.id);
      const binary = compileColumnarFeedLEAligned(twis, likes, comments, liked, followMap);
      return res.status(200).type("application/octet-stream").send(binary);
    } catch(e) {
      console.error('Feed error:', e);
      return res.status(500).send({ e: true });
    }
  });

 fastify.post("/twi/like", { 
    preHandler: [jwtAuth], 
    schema: LikeSchema 
  }, async (req, res) => {
    const { twiId } = req.body;
    const userId = req.user.id;

    const userIdStr = userId.toString();
    const twiIdStr = twiId.toString();
    
    const likeSetKey = `twi:likes:${twiIdStr}`;
    const userLikesKey = `user:${userIdStr}:likes`;
    const metaHashKey = `twi:meta:${twiIdStr}`;

    try {
      // 1. Optimistic Multi-Mutation Pipeline Execution (Single I/O Roundtrip)
      const pipeline = Cache.client.pipeline();
      pipeline.sadd(likeSetKey, userIdStr);
      const results = await pipeline.exec();
      
      // SADD returns 1 if element is added natively, 0 if it already existed
      const isNewLike = results[0][1] === 1; 

      if (isNewLike) {
        // Hydrate remaining user-centric keys and counters instantly
        const likePipeline = Cache.client.pipeline();
        likePipeline.sadd(userLikesKey, twiIdStr);
        likePipeline.hincrby(metaHashKey, 'likes', 1);
        likePipeline.expire(likeSetKey, 2592000);
        likePipeline.expire(userLikesKey, 2592000);
        await likePipeline.exec();

        // 🚀 Throw to BullMQ and don't await the job execution finish line
        await likeQueue.add(`like:${twiIdStr}:${userIdStr}`, {
          action: 'LIKE', twiId: twiIdStr, userIdStr, metaHashKey, likeSetKey, userLikesKey
        }, { attempts: 3, backoff: 5000 });

        return res.status(200).send({ 
          e: false, liked: true, message: "Tweet liked successfully" 
        });

      } else {
        // If it was already liked, reverse the state to UNLIKE
        const unlikePipeline = Cache.client.pipeline();
        unlikePipeline.srem(likeSetKey, userIdStr);
        unlikePipeline.srem(userLikesKey, twiIdStr);
        unlikePipeline.hincrby(metaHashKey, 'likes', -1);
        const unlikeResults = await unlikePipeline.exec();
        
        const currentLikes = unlikeResults[2][1];

        // 🚀 Throw the unlike operation to background worker 
        await likeQueue.add(`unlike:${twiIdStr}:${userIdStr}`, {
          action: 'UNLIKE', twiId: twiIdStr, userIdStr, metaHashKey, likeSetKey, userLikesKey
        }, { attempts: 3, backoff: 5000 });

        return res.status(200).send({ 
          e: false, liked: false, likes: currentLikes, message: "Tweet unliked successfully" 
        });
      }
    } catch (error) {
      console.error('Critical operational failure:', error);
      return res.status(500).send({ e: true, message: "Internal server error" });
    }
});

  // POST /twi/hasLiked
  fastify.post("/twi/hasLiked", { preHandler: [jwtAuth] }, async (req, res) => {
    try {
      const { twiId } = req.body;
      const userId = req.user.id;
      
      if (!twiId) {
        return res.status(400).send({ e: true, message: "twiId is required" });
      }
      
      const hasLiked = await Cache.like.get.hasLiked(twiId, userId);
      return res.status(200).send({ hasLiked, e: false });
    } catch (e) {
      console.error('HasLiked error:', e);
      return res.status(500).send({ e: true, message: "Internal server error" });
    }
  });
}

export default feedRoutes;