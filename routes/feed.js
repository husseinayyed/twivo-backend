// routes/feed.js - FIXED
import jwtAuth from "../middleware/jwt.js";
import compileColumnarFeedLEAligned from "../protobuf/src/protocol.js";
import Cache from "../utils/cache.js";
import { LikeSchema } from "./schemas/feedSchemas.js";
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

  // POST /twi/like - FIXED parameter passing
  fastify.post("/twi/like", { 
    preHandler: [jwtAuth], 
    schema: LikeSchema 
  }, async (req, res) => {
    // Extract variables from request
    const { twiId } = req.body;
    const userId = req.user.id;

    try {
      // CRITICAL FIX: Pass twiId as string, NOT as object
      // The error shows it's receiving { twiId: '...' } instead of just '...'
      const twi = await Cache.twi.get.getContent(twiId, userId);
      
      if (!twi) {
        return res.status(404).send({ e: true, message: "Tweet not found" });
      }
      
      // Check if already liked
      const alreadyLiked = await Cache.like.get.hasLiked(twiId, userId);

      if (!alreadyLiked) {
        // LIKE: Add like to both DB and Redis
        const success = await Cache.like.set.addLike(twiId, userId);
        
        if (!success) {
          return res.status(500).send({ e: true, message: "Failed to like tweet" });
        }
        
        return res.status(200).send({ 
          e: false, 
          liked: true, 
          message: "Tweet liked successfully" 
        });
      } else {
        // UNLIKE: Remove like from both DB and Redis
        const success = await Cache.like.set.removeLike(twiId, userId);
        
        if (!success) {
          return res.status(500).send({ e: true, message: "Failed to unlike tweet" });
        }

        // Get updated like count from cache
        const likeCount = await Cache.like.get.getTwiLikeCount(twiId);
        
        return res.status(200).send({ 
          e: false, 
          liked: false, 
          likes: likeCount,
          message: "Tweet unliked successfully" 
        });
      }
    } catch (error) {
      console.error('Error in like operation:', error);
      return res.status(500).send({ 
        e: true, 
        message: "Internal server error"
      });
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