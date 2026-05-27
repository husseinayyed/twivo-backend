
import { Like } from "../../models/like.js";
import { Twi } from "../../models/twi.js";
import { User } from "../../models/user.js";

class LikeSetCache {
    constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

   async addLike(twiId, userId) {
    const userIdStr = userId.toString();
    const twiIdStr = twiId.toString();
    
    const likeSetKey = `twi:likes:${twiIdStr}`;
    const userLikesKey = `user:${userIdStr}:likes`;
    const metaHashKey = `twi:meta:${twiIdStr}`;

    try {
        const isLiked = await this.client.sismember(likeSetKey, userIdStr);
        
        if (isLiked === 0) {
            const pipeline = this.client.pipeline();
            pipeline.sadd(likeSetKey, userIdStr);
            pipeline.sadd(userLikesKey, twiIdStr);
            pipeline.hincrby(metaHashKey, 'likes', 1);
            pipeline.expire(likeSetKey, 2592000);
            pipeline.expire(userLikesKey, 2592000);
            
            const [saddReply, saddUserReply, hincrReply] = await pipeline.exec();
            
            const addResult = saddReply[1];
            const currentCachedLikes = hincrReply[1];

            if (addResult === 1) {
                Like.create({ twiId: twiIdStr, likedBy: userIdStr })
                    .then(() => Twi.findByIdAndUpdate(twiIdStr, { $inc: { likes: 1 } }))
                    .catch((mongoError) => {
                        if (mongoError.code === 11000) {
                            const rollbackPipeline = this.client.pipeline();
                            rollbackPipeline.srem(likeSetKey, userIdStr);
                            rollbackPipeline.srem(userLikesKey, twiIdStr);
                            rollbackPipeline.hincrby(metaHashKey, 'likes', -1);
                            rollbackPipeline.exec();
                        }
                    });
            }
            
            return {
                success: true,
                liked: true,
                likesCount: currentCachedLikes,
                message: 'Tweet liked successfully'
            };
            
        } else {
            return await this.removeLike(twiIdStr, userIdStr);
        }
        
    } catch (error) {
        console.error("❌ CRITICAL ERROR in addLike:", error);
        return { success: false, error: error.message, liked: null };
    }
}

    async removeLike(twiId, userId) {
        const userIdStr = userId.toString();
        const twiIdStr = twiId.toString();
        const likeSetKey = `twi:likes:${twiIdStr}`;
        const userLikesKey = `user:${userIdStr}:likes`;
        const metaHashKey = `twi:meta:${twiIdStr}`;
        
        try {
            const pipeline = this.client.pipeline();
            pipeline.srem(likeSetKey, userIdStr);
            pipeline.srem(userLikesKey, twiIdStr);
            pipeline.hincrby(metaHashKey, 'likes', -1);
            
            const [sremReply, sremUserReply, hincrReply] = await pipeline.exec();
            const removeResult = sremReply[1];
            const currentCachedLikes = hincrReply[1];

            if (removeResult === 1) {
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
        } catch (error) {
            console.error("Error removing like:", error);
            return { success: false, message: 'Failed to remove like' };
        }
    }

    async syncLikesToCache(twiId) {
        const twiIdStr = twiId.toString();
        const likeKey = `twi:likes:${twiIdStr}`;
        const metaHashKey = `twi:meta:${twiIdStr}`;
        
        try {
            const likes = await Like.find({ twiId: twiIdStr }).select('likedBy');
            const userIds = likes.map(like => like.likedBy.toString());
            
            const pipeline = this.client.pipeline();
            pipeline.del(likeKey);
            if (userIds.length > 0) {
                pipeline.sadd(likeKey, ...userIds);
            }
            pipeline.hset(metaHashKey, 'likes', userIds.length.toString());
            pipeline.expire(likeKey, 2592000);
            await pipeline.exec();
            return true;
        } catch (error) {
            console.error("Error syncing likes to cache:", error);
            return false;
        }
    }
    
    async syncUserLikesToCache(userId) {
        const userIdStr = userId.toString();
        const userLikesKey = `user:${userIdStr}:likes`;
        
        try {
            const likes = await Like.find({ likedBy: userIdStr }).select('twiId');
            const tweetIds = likes.map(like => like.twiId.toString());
            
            const pipeline = this.client.pipeline();
            pipeline.del(userLikesKey);
            if (tweetIds.length > 0) {
                pipeline.sadd(userLikesKey, ...tweetIds);
            } else {
                // If the user has zero likes, we still need to "mark" the set as loaded 
                // to avoid re-checking DB. We can use a special field in user hash or 
                // just a very short-lived dummy member if we MUST, 
                // but a better way is a 'user:ID:likes:loaded' key.
                pipeline.set(`user:${userIdStr}:likes:loaded`, "1", "EX", 2592000);
            }
            pipeline.expire(userLikesKey, 2592000);
            await pipeline.exec();
            return true;
        } catch (error) {
            console.error("Error syncing user likes to cache:", error);
            return false;
        }
    }
}

export default LikeSetCache;