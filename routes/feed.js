import express from "express";
import jwtAuth from "../middleware/jwt.js";
import { Content } from "../models/content.js";
import Cache from "../utils/cache.js";
import { Twi } from "../models/twi.js";
import { Like } from "../models/like.js"
const feed = express.Router()




feed.get("/all",jwtAuth,async (req,res)=>{
  try {
   const startTime = Date.now();
    console.time(`getFeed`);
    
        // ... your code ...
        const feed = await Cache.twi.getFeed(req.user.id);
       
        const endTime = Date.now();
        console.timeEnd(`getFeed`);
        
        console.log(`✅ getFeed took: ${endTime - startTime}ms`);
     
    return res.status(200).json({feeds:feed})
  } catch(e) {
    
    return res.json({e:true})
  }
})
feed.post("/twi/like", jwtAuth, async (req, res) => {
  const { twiId } = req.body;
  const userId = req.user.id;

  if (!twiId) {
    return res.status(400).json({ e: true, message: "Tweet ID is required" });
  }

  try {
    const twi = await Cache.twi.getContent(twiId, userId);
    if (!twi) {
      return res.status(404).json({ e: true, message: "Tweet not found" });
    }
    const alreadyLiked = await Cache.like.hasLiked(twiId, userId);

    if (!alreadyLiked) {
      // LIKE: Everything handled in addLike (DB + Redis)
      const success = await Cache.like.addLike(twiId, userId);
      
      if (!success) {
        return res.status(500).json({ e: true, message: "Failed to like tweet" });
      }
      return res.status(200).json({ 
        e: false, 
        liked: true, 
        message: "Tweet liked successfully" 
      });

    } else {
      // UNLIKE: Everything handled in removeLike (DB + Redis)
      const success = await Cache.like.removeLike(twiId, userId);
      
      if (!success) {
        return res.status(500).json({ e: true, message: "Failed to unlike tweet" });
      }

      // Get updated like count from cache
      const likeCount = await Cache.like.getTwiLikeCount(twiId);
      
      return res.status(200).json({ 
        e: false, 
        liked: false, 
        likes: likeCount,
        message: "Tweet unliked successfully" 
      });
    }

  } catch (error) {
    console.error('Error in like operation:', error);
    return res.status(500).json({ 
      e: true, 
      message: "Internal server error"
    });
  }
});
feed.post("/twi/hasLiked", jwtAuth, async (req, res) => {
  try {
    const { twisId } = req.body;
    
    if (!req.user.id || !twisId) {
      return res.status(400).json({ e: true, message: "Missing user ID or twisId" });
    }

    // Initialize the list array
    let list = [];
    
    // Check if twisId is an array
    if (!Array.isArray(twisId)) {
      return res.status(400).json({ e: true, message: "twisId must be an array" });
    }

    for (const twiId of twisId) {
      // Use Cache.hasLiked (not Cache.hasLiked)
      const hasLiked = await Cache.like.hasLiked(twiId, req.user.id);
      list.push(hasLiked);
    }
    
    return res.status(200).json({ list, e: false });
  } catch (e) {
    
    return res.status(500).json({ e: true, message: "Internal server error" });
  }
});
export default feed