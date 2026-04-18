
import { Like } from "../../models/like.js";
import { Twi } from "../../models/twi.js";
import { User } from "../../models/user.js";

class LikeSetCache {
    constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

    async addLike(twiId, userId) {
        console.log(`🔍 addLike called: twiId=${twiId}, userId=${userId}`);
        
        const likeKey = `twi:likes:${twiId}`;
        
        try {
            // 1. Check Redis directly
            console.log(`🔍 Checking Redis key: ${likeKey}`);
            const isLiked = await this.client.sismember(likeKey, userId);
            console.log(`🔍 Redis sismember result: ${isLiked} (0=not liked, 1=liked)`);
            
            // 2. Check MongoDB for comparison
            const mongoLike = await Like.findOne({ twiId, likedBy: userId });
            console.log(`🔍 MongoDB like exists: ${!!mongoLike}`);
            
            if (isLiked === 0) {
                console.log("📥 Attempting to LIKE tweet...");
                
                // Add to Redis
                const addResult = await this.client.sadd(likeKey, userId.toString());
                console.log(`🔍 Redis SADD result: ${addResult} (1=added, 0=already exists)`);
                
                // Set expiration
                await this.client.expire(likeKey, 2592000);
                console.log("✅ Added to Redis");
                
                // Save to MongoDB
                try {
                    const newLike = await Like.create({ twiId, likedBy: userId });
                    console.log(`✅ MongoDB like created: ${newLike._id}`);
                    
                    // Update tweet likes count
                    const updatedTwi = await Twi.findByIdAndUpdate(
                        twiId,
                        { $inc: { likes: 1 } },
                        { new: true }
                    );
                    console.log(`✅ Tweet likes updated: ${updatedTwi?.likes}`);
                    
                } catch (mongoError) {
                    console.error("❌ MongoDB error:", mongoError.message);
                    
                    // If MongoDB fails, rollback Redis
                    if (mongoError.code === 11000) {
                        console.log("🔄 Duplicate key - removing from Redis");
                        await this.client.srem(likeKey, userId.toString());
                    }
                }
                
                // Invalidate cache
                await this.client.del("feed");
                console.log("✅ Feed cache invalidated");
                
                return {
                    success: true,
                    liked: true,
                    message: 'Tweet liked successfully'
                };
                
            } else {
                console.log("📤 Attempting to UNLIKE tweet...");
                
                // Remove from Redis
                const removeResult = await this.client.srem(likeKey, userId.toString());
                console.log(`🔍 Redis SREM result: ${removeResult} (1=removed, 0=wasn't there)`);
                
                console.log("✅ Removed from Redis");
                
                // Remove from MongoDB
                try {
                    const deleteResult = await Like.deleteOne({ twiId, likedBy: userId });
                    console.log(`✅ MongoDB like deleted: ${deleteResult.deletedCount}`);
                    
                    // Update tweet likes count
                    const updatedTwi = await Twi.findByIdAndUpdate(
                        twiId,
                        { $inc: { likes: -1 } },
                        { new: true }
                    );
                    console.log(`✅ Tweet likes updated: ${updatedTwi?.likes}`);
                    
                } catch (mongoError) {
                    console.error("❌ MongoDB error:", mongoError.message);
                }
                
                // Invalidate cache
                await this.client.del("feed");
                console.log("✅ Feed cache invalidated");
                
                return {
                    success: true,
                    liked: false,
                    message: 'Tweet unliked successfully'
                };
            }
            
        } catch (error) {
            console.error("❌ CRITICAL ERROR in addLike:", error);
            console.error("Stack:", error.stack);
            
            return {
                success: false,
                error: error.message,
                liked: null
            };
        }
    }

    async removeLike(twiId, userId) {
        const likeKey = `twi:likes:${twiId}`;
        const twiKey = `twi:${twiId}`;
        
        try {
            const like = await Like.findOne({ twiId, likedBy: userId });
            if (!like) return false;
            
            await like.deleteOne();
            
            const twi = await Twi.findOne({ _id: twiId });
            if (twi) {
                twi.likes = Math.max(0, twi.likes - 1);
                await twi.save();
            }
            
            await this.srem(likeKey, userId.toString());
            
            let cached = await this.hgetall(twiKey);
            if (!cached && twi) {
                const user = await User.findById(twi.author.userId);
                await this.hset(twiKey, 300, ...this.getTwiCacheFields(twi, user));
            } else if (cached) {
                cached.likes = twi ? twi.likes : 0;
                await this.hset(twiKey, 300, ...Object.entries(cached).flat());
            }
            
            return true;
        } catch (error) {
            console.error("Error removing like:", error);
            return false;
        }
    }

    // Helper method to sync Redis cache from MongoDB
    async syncLikesToCache(twiId) {
        const likeKey = `twi:likes:${twiId}`;
        
        try {
            const likes = await Like.find({ twiId }).select('likedBy');
            const userIds = likes.map(like => like.likedBy.toString());
            
            if (userIds.length > 0) {
                const pipeline = this.client.pipeline();
                pipeline.del(likeKey);
                pipeline.sadd(likeKey, ...userIds);
                pipeline.expire(likeKey, 2592000);
                await pipeline.exec();
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error syncing likes to cache:", error);
            return false;
        }
    }

    // Invalidate all like-related caches for a tweet
    async invalidateLikeCache(twiId) {
        const likeKey = `twi:likes:${twiId}`;
        const likeCountKey = `twi:likes:${twiId}:count`;
        
        try {
            await this.client.del(likeKey);
            await this.client.del(likeCountKey);
            await this.client.del("feed");
            return true;
        } catch (error) {
            console.error("Error invalidating like cache:", error);
            return false;
        }
    }
}

export default LikeSetCache;