import express from "express";
import multer from "multer"
import jwtAuth from "../middleware/jwt.js"
import sharp from "sharp"
import { User } from "../models/user.js";
import Cache from "../utils/cache.js"
const user = express.Router()
const upload = multer({storage:multer.memoryStorage()})
user.get("/ping",(req,res)=>{
    res.sendStatus(200)
})
user.post("/follow",jwtAuth,(req,res)=>{
    const {targetUserId} = req.body
    if(!targetUserId) return res.status(400).json({e:true,msg:"targetUserId is required"})
    if(targetUserId === req.user.id) {
        return res.status(400).json({e:true,msg:"You cannot follow yourself"})
      }
   const result =  Cache.follow.followUser(req.user.id,targetUserId)
   if(result) {
    return res.status(200).json({e:false,msg:"Follow status toggled"})
   } else {
    return res.status(500).json({e:true,msg:"An error occurred"})
   }
})
// Just update your profile endpoint to use the function you already have
user.get("/profile", jwtAuth, async (req, res) => {
  const start = Date.now();
  try {
    const userId = req.user.id;
    
    // 1. Get user profile
    const userData = await Cache.user.getUser(userId);
    if (!userData) return res.status(404).json({ error: "User not found" });
    
    const { username, bio, image, createdAt } = userData;
    
    // 2. Get user tweets and follow stats IN ONE GO
    const userTwis = await Cache.user.getUserTwis(userId, userId);
    
    // 3. Get follow stats (you already have this function in FollowCache)
    const followStats = await Cache.follow.getFollowStats(userId);
    
    // 4. No need to enhance tweets - getUserTwis already does it
    console.log(`✅ Profile loaded in ${Date.now() - start}ms`);
    
    res.status(200).json({
      data: {
        username,
        bio,
        image,
        createdAt,
        userId,
        myself: true
      },
      feeds: userTwis, // Already enhanced with all needed fields
      followersCount: followStats.followers || 0,
      followingCount: followStats.following || 0
    });
    
  } catch (error) {
    console.error("Error loading profile:", error);
    res.status(500).json({ error: "Failed to load profile" });
  }
});
async function resizeBuffer(imageBuffer, width, height = null) {
  return await sharp(imageBuffer)
    .resize(width, height)
    .jpeg({ quality: 80 }) // Optional: reduce quality
    .toBuffer();
}
user.get("/:id", jwtAuth, async (req, res) => {
  try {
    const userId = req.params.id; // From URL params
    const viewerId = req.user.id; // From JWT token
    
    // 1. Get user profile from cache
    const userProfile = await Cache.user.getUser(userId);
    if (!userProfile) {
      return res.status(404).json({ error: "User not found" });
    }
    console.log(userProfile)
    // 2. Get user tweets
    const userTwis = await Cache.user.getUserTwis(userId, viewerId);
    
    // 3. Get follow stats
    const followStats = await Cache.follow.getFollowStats(userId) || { 
      followers: 0, 
      following: 0 
    };
    
    // 4. Check if viewer follows this user
    let isFollowing = false;
    let followsYou = false;
    
    if (viewerId !== userId) {
      isFollowing = await Cache.follow.isFollowing(viewerId, userId);
      followsYou = await Cache.follow.isFollowing(userId, viewerId);
    }
    
    // 5. Prepare response
    const response = {
      success: true,
      profile: {
        _id: userProfile._id,
        userId: userProfile._id,
        username: userProfile.username,
        bio: userProfile.bio || '',
        image: userProfile.image || '',
        createdAt: userProfile.createdAt,
        isVerified: userProfile.isVerified || false,
        myself: viewerId === userId,
        isFollowing,
        followsYou,
        followersCount: followStats.followers,
        followingCount: followStats.following,
      },
      twis: userTwis
    };
    res.status(200).json(response);
    
  } catch (error) {
    console.error("Error in user profile endpoint:", error);
    res.status(500).json({ 
      error: "Failed to load user profile",
      message: error.message 
    });
  }
});
user.post("/profile/image",jwtAuth,upload.single("file"),async (req,res)=>{
  if(!req.file) return res.status(400).json({e:true})
    try {
     const formData = new FormData();
     const buffer = await resizeBuffer(req.file.buffer,150,150)
     if(buffer) {

      formData.append('image', buffer.toString('base64'));
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API}`, {
        method: "POST",
        body: formData,
        // Add timeout and connection handling
        timeout: 30000, // 30 second timeout
      });
      if (!response.ok) {
        throw new Error(`ImgBB API error: ${response.status}`);
      }
       const result = await response.json();
    const imageUrl = result.data.url;

    // Find user and update image
    const user = await User.findByIdAndUpdate(
      req.user.id, // From your jwtAuth middleware
      { 
        image: imageUrl 
      },
      { 
        new: true // Return updated document
      }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const userKey = `user:${req.user.id}`;
      
      // Method 1: Update just the image field in the hash
      await Cache.user.hset(userKey, 604800, 'image', imageUrl);

    console.log(user)
     }
   return res.status(200).json({e:false})
    } catch (error) {
        console.log(error)
        return res.status(400).json({e:error})
    }
})
export default user