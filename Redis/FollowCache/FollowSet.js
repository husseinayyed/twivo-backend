import { Follow } from "../../models/follow.js";

class FollowSet {
    constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
  }

    async followUser(followerId, followedId) {
        const followerIdStr = followerId.toString();
        const followedIdStr = followedId.toString();

        try {
            if (followerIdStr === followedIdStr) {
                return { success: false, message: 'Cannot follow yourself' };
            }
            
            // 1. Check Redis for current state
            const followingKey = `user:${followerIdStr}:following`;
            const followersKey = `user:${followedIdStr}:followers`;
            
            const isFollowing = await this.client.sismember(followingKey, followedIdStr);
            
            if (isFollowing === 1) {
                // UNFOLLOW
                const pipeline = this.client.pipeline();
                pipeline.srem(followingKey, followedIdStr);
                pipeline.srem(followersKey, followerIdStr);
                await pipeline.exec();

                // Async DB sync
                Follow.deleteOne({
                    follower: followerIdStr,
                    following: followedIdStr
                }).catch(err => console.error('Unfollow DB error:', err));
                
                return {
                    success: true,
                    action: 'unfollowed',
                    isFollowing: false
                };
                
            } else {
                // FOLLOW
                const pipeline = this.client.pipeline();
                pipeline.sadd(followingKey, followedIdStr);
                pipeline.sadd(followersKey, followerIdStr);
                pipeline.expire(followingKey, 2592000); // 30 days
                pipeline.expire(followersKey, 2592000);
                await pipeline.exec();

                // Async DB sync
                Follow.create({
                    follower: followerIdStr,
                    following: followedIdStr
                }).catch(err => {
                    if (err.code !== 11000) {
                        console.error('Follow DB error:', err);
                    }
                });
                
                return {
                    success: true,
                    action: 'followed',
                    isFollowing: true
                };
            }
            
        } catch (error) {
            console.error('Error in followUser:', error);
            return { 
                success: false, 
                message: 'Operation failed',
                error: error.message 
            };
        }
    }

    async syncFollowingToCache(userId) {
        const userIdStr = userId.toString();
        const followingKey = `user:${userIdStr}:following`;
        const loadedKey = `${followingKey}:loaded`;
        
        try {
            const follows = await Follow.find({ follower: userIdStr }).select('following');
            const targetIds = follows.map(f => f.following.toString());
            
            const pipeline = this.client.pipeline();
            pipeline.del(followingKey);
            if (targetIds.length > 0) {
                pipeline.sadd(followingKey, ...targetIds);
            }
            
            // Set 'loaded' flag to 1 even if the set is empty
            pipeline.set(loadedKey, "1", "EX", 86400); 
            pipeline.expire(followingKey, 86400);
            
            await pipeline.exec();
            return true;
        } catch (error) {
            console.error("Error syncing following to cache:", error);
            return false;
        }
    }
    
}

export default FollowSet;