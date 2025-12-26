import BaseCache from "./BaseCache.js";
import { Follow } from "../models/follow.js";

class FollowCache extends BaseCache {
    constructor(client, cacheService) {
        super(client);
        this.cache = cacheService;
    }
    async followUser(followerId, followedId) {
        try {
            // Basic validation
            if (followerId === followedId) {
                return { success: false, message: 'Cannot follow yourself' };
            }
            
            // Check Redis cache first
            const isFollowing = await this.isFollowing(followerId, followedId);
            
            if (isFollowing) {
                // UNFOLLOW
                await Follow.deleteOne({
                    follower: followerId,
                    following: followedId
                });
                
                // Update Redis
                const pipeline = this.client.pipeline();
                pipeline.srem(`user:${followerId}:following`, followedId);
                pipeline.srem(`user:${followedId}:followers`, followerId);
                await pipeline.exec();
                
                return {
                    success: true,
                    action: 'unfollowed',
                    message: 'Unfollowed successfully',
                    isFollowing: false
                };
                
            } else {
                // FOLLOW - Create in MongoDB
                const newFollow = await Follow.create({
                    follower: followerId,
                    following: followedId
                });
                
                // Update Redis
                const pipeline = this.client.pipeline();
                pipeline.sadd(`user:${followerId}:following`, followedId);
                pipeline.sadd(`user:${followedId}:followers`, followerId);
                await pipeline.exec();
                
                return {
                    success: true,
                    action: 'followed',
                    message: 'Followed successfully',
                    isFollowing: true,
                    followId: newFollow._id
                };
            }
            
        } catch (error) {
            console.error('Error in toggleFollow:', error);
            
            // Handle duplicate key error (already following)
            if (error.code === 11000 || error.message.includes('duplicate')) {
                return { 
                    success: false, 
                    message: 'Already following this user' 
                };
            }
            
            return { 
                success: false, 
                message: 'Operation failed',
                error: error.message 
            };
        }
    }
    
    async isFollowing(userId, targetUserId, pipeline = null) {
    const followingKey = `user:${userId}:following`;
    
    if (pipeline) {
        // Just add the command to pipeline
        pipeline.sismember(followingKey, targetUserId);
        return; // Don't return anything when pipeline is used
    }
    
    // Regular execution without pipeline
    const result = await this.client.sismember(followingKey, targetUserId);
    if (result === 1) return true;
    
    // Check database
    const follow = await Follow.findOne({ 
        follower: userId, 
        following: targetUserId 
    }).lean();
    
    if (follow) {
        // Cache result
        const cachePipeline = this.client.pipeline();
        cachePipeline.sadd(followingKey, targetUserId);
        cachePipeline.sadd(`user:${targetUserId}:followers`, userId);
        cachePipeline.expire(followingKey, 300);
        cachePipeline.expire(`user:${targetUserId}:followers`, 300);
        await cachePipeline.exec();
        return true;
    }
    
    return false;
}
    
    async batchIsFollowing(userId, targetUserIds) {
        const pipeline = this.client.pipeline();
        
        targetUserIds.forEach(targetId => {
            pipeline.sismember(`user:${userId}:following`, targetId);
        });
        
        const results = await pipeline.exec();
        return results.map(([err, result]) => result === 1);
    }
    async getFollowStats(userId) {
    try {
        const [following, followers] = await Promise.all([
            this.client.scard(`user:${userId}:following`),
            this.client.scard(`user:${userId}:followers`)
        ]);
        
        return {
            following: following || 0,
            followers: followers || 0
        };
    } catch (error) {
        console.error("Error getting follow stats:", error);
        return { following: 0, followers: 0 };
    }
}
}

export default FollowCache;