
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
    
    const userIdStr = userId.toString();
    const twiIdStr = twiId.toString();
    
    const likeSetKey = `twi:likes:${twiIdStr}`;
    const metaHashKey = `twi:meta:${twiIdStr}`; // FIXED: Aligned with feed assembly keys

    try {
        // 1. Check Redis Set for rapid O(1) relational existence check
        const isLiked = await this.client.sismember(likeSetKey, userIdStr);
        
        if (isLiked === 0) {
            console.log("📥 Attempting to LIKE tweet...");
            
            // 2. Multi-key transactional pipeline to update state atomicity
            const pipeline = this.client.pipeline();
            pipeline.sadd(likeSetKey, userIdStr);
            pipeline.hincrby(metaHashKey, 'likes', 1); // FIXED: Increments correct hash key
            pipeline.expire(likeSetKey, 2592000); // 30 days rolling retention
            
            const [saddReply, hincrReply] = await pipeline.exec();
            
            const addResult = saddReply[1];
            const currentCachedLikes = hincrReply[1];

            // If addResult is 0, it means the user somehow raced and liked it already
            if (addResult === 1) {
                // 3. Asynchronously persist changes to MongoDB.
                // Do not await this before responding to the user if you want <5ms response times.
                Like.create({ twiId: twiIdStr, likedBy: userIdStr })
                    .then(() => Twi.findByIdAndUpdate(twiIdStr, { $inc: { likes: 1 } }))
                    .catch((mongoError) => {
                        console.error("❌ MongoDB write async sync error:", mongoError.message);
                        // If it's a true unique constraint duplicate, correct our optimistic counter
                        if (mongoError.code === 11000) {
                            const rollbackPipeline = this.client.pipeline();
                            rollbackPipeline.srem(likeSetKey, userIdStr);
                            rollbackPipeline.hincrby(metaHashKey, 'likes', -1);
                            rollbackPipeline.exec();
                        }
                    });
            }
            
            // OPTIMIZATION: Removed global `del("feed")`. 
            // Real-time feeds read from the shared `metaHashKey` values, so updates reflect instantly 
            // without rebuilding the layout cache!

            return {
                success: true,
                liked: true,
                likesCount: currentCachedLikes,
                message: 'Tweet liked successfully'
            };
            
        } else {
            console.log("📤 Attempting to UNLIKE tweet...");
            
            // 4. Multi-key transactional pipeline for Unliking
            const pipeline = this.client.pipeline();
            pipeline.srem(likeSetKey, userIdStr);
            pipeline.hincrby(metaHashKey, 'likes', -1); // FIXED: Decrements count on unlike execution
            
            const [sremReply, hincrReply] = await pipeline.exec();
            
            const removeResult = sremReply[1];
            const currentCachedLikes = hincrReply[1];

            if (removeResult === 1) {
                // Async persist removal to MongoDB database layer
                Like.deleteOne({ twiId: twiIdStr, likedBy: userIdStr })
                    .then(() => Twi.findByIdAndUpdate(twiIdStr, { $inc: { likes: -1 } }))
                    .catch((mongoError) => console.error("❌ MongoDB delete sync error:", mongoError));
            }
            
            return {
                success: true,
                liked: false,
                likesCount: currentCachedLikes,
                message: 'Tweet unliked successfully'
            };
        }
        
    } catch (error) {
        console.error("❌ CRITICAL ERROR in addLike:", error);
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
            
            await this.client.srem(likeKey, userId.toString());
            
            let cached = await this.client.hgetall(twiKey);
            if (!cached && twi) {
                const user = await User.findById(twi.author.userId);
                await this.client.hset(twiKey, 300, ...this.getTwiCacheFields(twi, user));
            } else if (cached) {
                cached.likes = twi ? twi.likes : 0;
                await this.client.hset(twiKey, 300, ...Object.entries(cached).flat());
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