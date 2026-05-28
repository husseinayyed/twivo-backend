import { Follow } from "../../models/follow.js";

class FollowSet {
    constructor(client, cacheService) {
        this.client = client;
        this.cache = cacheService;
    }

    async followUser(followerId, followedId) {
        const followerIdStr = followerId.toString();
        const followedIdStr = followedId.toString();

        if (followerIdStr === followedIdStr) {
            return { success: false, message: 'Cannot follow yourself' };
        }

        const followingKey = `user:${followerIdStr}:following`;
        const followersKey = `user:${followedIdStr}:followers`;

        try {
            // Use Redis sets to manage follow relationships with atomic operations
            // This approach ensures that we can handle follow/unfollow actions efficiently and maintain consistency between the two sets 
            const pipeline = this.client.pipeline();
            pipeline.sadd(followingKey, followedIdStr);
            pipeline.sadd(followersKey, followerIdStr);
            pipeline.expire(followingKey, 2592000); // 30 days
            pipeline.expire(followersKey, 2592000);
            
            const results = await pipeline.exec();
            
            // the first command's result will indicate if we added a new follow (1) or if it was already there (0)
            const isNewFollow = results[0][1] === 1;

            if (isNewFollow) {
                // Only create the DB entry if this is a new follow relationship to avoid duplicates
                Follow.create({
                    follower: followerIdStr,
                    following: followedIdStr
                }).catch(err => {
                    if (err.code === 11000) {
                        // someone else already created this follow relationship in the DB, which means our Redis state is correct
                        const rollback = this.client.pipeline();
                        rollback.srem(followingKey, followedIdStr);
                        rollback.srem(followersKey, followerIdStr);
                        rollback.exec().catch(console.error);
                    } else {
                        console.error('Follow DB error:', err);
                    }
                });

                return {
                    success: true,
                    action: 'followed',
                    isFollowing: true
                };
            } else {
                //in case of unfollow, we need to remove the relationship from both sets
                const unfollowPipeline = this.client.pipeline();
                unfollowPipeline.srem(followingKey, followedIdStr);
                unfollowPipeline.srem(followersKey, followerIdStr);
                await unfollowPipeline.exec();

                // In case of unfollow, we also want to remove the follow relationship from the DB to keep it clean
                Follow.deleteOne({
                    follower: followerIdStr,
                    following: followedIdStr
                }).catch(err => console.error('Unfollow DB error:', err));

                return {
                    success: true,
                    action: 'unfollowed',
                    isFollowing: false
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