import express from "express";
import { rateLimit } from 'express-rate-limit'
import jwtAuth from "../middleware/jwt.js";
import multer from "multer"
import { Content } from "../models/content.js";
import Cache from "../utils/cache.js";
import { Twi } from "../models/twi.js";
import { Like } from "../models/like.js"
const feed = express.Router()
const createLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    limit: 10
})
const upload = multer({storage:multer.memoryStorage()})



feed.post("/create", createLimiter, jwtAuth, upload.single("file"), async (req, res) => {
  try {
    const { text } = req.body;
    const file = req.file;
    
    if (!text) {
      return res.status(400).json({ msg: "Text field is required" });
    }

    let json = null;
    let aspect = null;
    let imageUrl = null;
    let deleteUrl = null;

    // Only process file if it exists
    if (file) {
      const formData = new FormData();
      formData.append('image', file.buffer.toString('base64'));

      const response = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API}`, {
        method: "POST",
        body: formData,
        timeout: 30000,
      });

      if (!response.ok) {
        throw new Error(`ImgBB API error: ${response.status}`);
      }

      json = await response.json();

      // Check if json.data exists
      if (!json.data) {
        throw new Error("Invalid response from ImgBB API");
      }

      // Calculate aspect ratio
      if (json.data.width > json.data.height) aspect = "horizontal";
      else if (json.data.width < json.data.height) aspect = "vertical";
      else aspect = "square";

      imageUrl = json.data.url;
      deleteUrl = json.data.delete_url;
    }
    const newfeed = await Twi.create({
      author: {
        userId: req.user.id,
        username: req.user.username,
        image: req.user.image || null
      },
      content: {
        text,
        attachment: file ? true : false,
        image: imageUrl,
        aspectClass: aspect,
        deleteUrl: deleteUrl
      },
      likes: 0,
      comments: 0
    });
 const get = await Cache.twi.addToFeedCache(newfeed)
 
  // In your create tweet route:
return res.status(201).json({
  success: true,
  feed: {
    _id: newfeed._id.toString(),
    twiId: newfeed._id.toString(),
    author: {
      userId: req.user.id,
      username: req.user.username,
      image: req.user.image || 'default'
    },
    comments: 0,
    content: {
      text: text,
      attachment: file ? true : false,
      image: imageUrl || null,
      aspectClass: aspect || null,
      deleteUrl: deleteUrl || null
    },
    createdAt: newfeed.createdAt,
    likes: 0,
    isLiked: false,
    isFollowing: false,
    followsYou: false,
    myself: true
  }
})

  } catch (error) {
    console.error("Error creating feed:", error);
    return res.status(500).json({ 
      e: true, 
      msg: error.message || "Failed to create feed" 
    });
  }
});
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
/*
{
  data: {
    id: 'k2xTKjVN',
    title: '219d603d8cb6',
    url_viewer: 'https://ibb.co/k2xTKjVN',
    url: 'https://i.ibb.co/RT9K2fGR/219d603d8cb6.png',
    display_url: 'https://i.ibb.co/b5PV1Tjc/219d603d8cb6.png',
    time: 1761921281,
    expiration: 0,
    image
    thumb
    medium
    delete_url: 'https://ibb.co/k2xTKjVN/71e1cbd2e149a2e6101c64b419542162'
  },
*/