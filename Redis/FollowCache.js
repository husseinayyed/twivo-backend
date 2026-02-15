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
    
   // In FollowCache.js - PROPER version with DB fallback
async batchIsFollowing(userId, targetUserIds) {
    const userIdStr = userId.toString();
    
    try {
        const pipeline = this.client.pipeline();
        
        // First, check Redis for all targets
        targetUserIds.forEach(targetId => {
            const targetIdStr = targetId.toString();
            pipeline.sismember(`user:${userIdStr}:following`, targetIdStr);
        });
        
        const results = await pipeline.exec();
        const finalResults = [];
        const targetsToCheckInDB = [];
        
        // Process Redis results
        results.forEach(([err, redisResult], index) => {
            const targetUserId = targetUserIds[index];
            
            if (!err && redisResult === 1) {
                // Redis says following
                finalResults[index] = {
                    targetUserId: targetUserId,
                    isFollowing: true,
                    success: true,
                    fromCache: true
                };
            } else {
                // Redis says not following OR error - need to check DB
                targetsToCheckInDB.push({ targetUserId, index });
                finalResults[index] = {
                    targetUserId: targetUserId,
                    isFollowing: false, // temporary
                    success: false,
                    fromCache: false
                };
            }
        });
        
        // Check DB for uncertain targets
        if (targetsToCheckInDB.length > 0) {
            const targetIdsForDB = targetsToCheckInDB.map(t => t.targetUserId);
            
            // Get follows from MongoDB in ONE query
            const dbFollows = await Follow.find({
                follower: userId,
                following: { $in: targetIdsForDB }
            }).select('following').lean();
            
            // Create a set for quick lookup
            const followingIds = new Set(
                dbFollows.map(follow => follow.following.toString())
            );
            
            // Update results and sync to Redis
            const redisPipeline = this.client.pipeline();
            
            targetsToCheckInDB.forEach(({ targetUserId, index }) => {
                const targetIdStr = targetUserId.toString();
                const isFollowing = followingIds.has(targetIdStr);
                
                // Update final result
                finalResults[index] = {
                    targetUserId: targetUserId,
                    isFollowing: isFollowing,
                    success: true,
                    fromCache: false
                };
                
                // Sync to Redis
                if (isFollowing) {
                    redisPipeline.sadd(`user:${userIdStr}:following`, targetIdStr);
                    redisPipeline.sadd(`user:${targetIdStr}:followers`, userIdStr);
                    redisPipeline.expire(`user:${userIdStr}:following`, 300);
                    redisPipeline.expire(`user:${targetIdStr}:followers`, 300);
                }
            });
            
            await redisPipeline.exec();
        }
        
        return finalResults;
        
    } catch (error) {
        console.error(`Error in batchIsFollowing:`, error);
        
        // Fallback: check DB
        const dbFollows = await Follow.find({
            follower: userId,
            following: { $in: targetUserIds }
        }).select('following').lean();
        
        const followingIds = new Set(
            dbFollows.map(follow => follow.following.toString())
        );
        
        return targetUserIds.map(targetUserId => ({
            targetUserId: targetUserId,
            isFollowing: followingIds.has(targetUserId.toString()),
            success: true,
            fromCache: false
        }));
    }
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