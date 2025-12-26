import BaseCache from './BaseCache.js';
import { User } from "../models/user.js";
import { Twi } from "../models/twi.js";

class UserCache extends BaseCache {
    constructor(client, cacheService) {
        super(client);
        this.cache = cacheService;
    }

    // ========== PUBLIC METHODS ==========
    
    async getUserTwis(userId, viewerId = null) {
        const start = Date.now();
        
        try {
            const cachedTwis = await this._getCachedUserTwis(userId);
            if (cachedTwis && cachedTwis.length > 0) {
                const enrichedTwis = await this._enrichCachedTwis(cachedTwis, userId, viewerId);
                console.log(`✅ USER TWIS CACHE HIT: ${Date.now() - start}ms`);
                return enrichedTwis;
            }
            
            return await this._fetchFreshUserTwis(userId, viewerId, start);
        } catch (error) {
            console.error("Error in getUserTwis:", error);
            return [];
        }
    }
    
    async getUser(token) {
        try {
            const cachedUser = await this._getCachedUser(token);
            if (cachedUser) return cachedUser;
            
            return await this._fetchAndCacheUser(token);
        } catch (error) {
            console.error("Error getting user from cache:", error);
            return null;
        }
    }
    
    async getUsers(userIds) {
        if (!Array.isArray(userIds) || userIds.length === 0) return [];
        
        try {
            return await this._batchGetUsers(userIds);
        } catch (error) {
            console.error("Error in getUsers:", error);
            return [];
        }
    }

    // ========== USER TWIS METHODS ==========
    
    async _getCachedUserTwis(userId) {
        const twisKey = `user:${userId}:twis`;
        const cachedTwis = await this.client.lrange(twisKey, 0, 49);
        
        if (!cachedTwis || cachedTwis.length === 0) {
            return null;
        }
        
        return cachedTwis
            .map(json => {
                try { return JSON.parse(json); } 
                catch { return null; }
            })
            .filter(Boolean);
    }
    
    async _enrichCachedTwis(twis, userId, viewerId) {
        if (!viewerId) {
            // Just get like counts if no viewer
            await this._addLikeCountsToTwis(twis);
            twis.forEach(twi => twi.myself = false);
            return twis;
        }
        
        // Get like counts
        await this._addLikeCountsToTwis(twis);
        
        // Create pipeline for status checks
        const pipeline = this.client.pipeline();
        const isSameUser = viewerId === userId;
        
        for (const twi of twis) {
            const twiId = twi._id || twi.twiId;
            
            // Check if viewer liked
            pipeline.sismember(`twi:likes:${twiId}`, viewerId);
            
            // Check following if different users
            if (!isSameUser) {
                pipeline.sismember(`user:${viewerId}:following`, userId);
                pipeline.sismember(`user:${userId}:following`, viewerId);
            }
        }
        
        // Execute pipeline
        const results = await pipeline.exec();
        
        // Apply results
        let idx = 0;
        for (const twi of twis) {
            twi.isLiked = results[idx][1] === 1;
            idx++;
            
            if (!isSameUser) {
                twi.isFollowing = results[idx][1] === 1;
                idx++;
                twi.followsYou = results[idx][1] === 1;
                idx++;
            } else {
                twi.isFollowing = false;
                twi.followsYou = false;
            }
            
            twi.myself = isSameUser;
        }
        
        return twis;
    }
    
    async _fetchFreshUserTwis(userId, viewerId, startTime) {
        // Fetch from database
        const twis = await Twi.find({ 'author.userId': userId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        
        if (!twis.length) return [];
        
        // Get tweet IDs
        const tweetIds = twis.map(t => t._id.toString());
        
        // Get all metadata in parallel
        const [likeCounts, isLikedResults, followResults] = await Promise.all([
            this._batchGetLikeCounts(tweetIds),
            viewerId ? this._batchCheckLikedStatus(tweetIds, viewerId) : Promise.resolve(new Array(twis.length).fill(false)),
            this._getFollowStatus(viewerId, userId)
        ]);
        
        // Enrich tweets
        const finalTwis = twis.map((twi, index) => {
            const twiId = tweetIds[index];
            const isSameUser = viewerId === userId;
            
            return {
                ...twi,
                _id: twiId,
                twiId: twiId,
                likes: likeCounts[index],
                isLiked: isLikedResults[index],
                isFollowing: !isSameUser ? followResults[0] : false,
                followsYou: !isSameUser ? followResults[1] : false,
                myself: isSameUser
            };
        });
        
        // Cache results
        await this._cacheUserTwis(userId, finalTwis);
        
        console.log(`✅ USER TWIS FRESH FETCH: ${Date.now() - startTime}ms`);
        return finalTwis;
    }
    
    async _cacheUserTwis(userId, twis) {
        const twisKey = `user:${userId}:twis`;
        const pipeline = this.client.pipeline();
        
        for (const twi of twis) {
            const twiId = twi.twiId || twi._id;
            
            // Add to user's twis list
            pipeline.rpush(twisKey, JSON.stringify(twi));
            
            // Cache individual tweet
            pipeline.hset(`twi:${twiId}`, this._createTwiCacheData(twi, userId));
            pipeline.expire(`twi:${twiId}`, 300);
        }
        
        // Trim list and set expiry
        pipeline.ltrim(twisKey, 0, 49);
        pipeline.expire(twisKey, 300);
        
        await pipeline.exec();
    }

    // ========== USER METHODS ==========
    
    async _getCachedUser(token) {
        const userKey = `user:${token}`;
        
        if (!(await this.exists(userKey))) {
            return null;
        }
        
        const cached = await this.hgetall(userKey);
        if (!cached?.username) return null;
        
        return this._formatCachedUser(cached, token);
    }
    
    async _fetchAndCacheUser(token) {
        const user = await User.findById(token);
        if (!user) return null;
        
        // Cache the user
        await this._cacheUserData(user);
        
        return {
            _id: user._id.toString(),
            username: user.username,
            password: user.password,
            remember: user.remember || false,
            recoveryKeys: user.recoveryKeys || [],
            role: user.role,
            image: user.image,
            bio: user.bio,
            refreshToken: user.refreshToken || null,
            createdAt: user.createdAt
        };
    }
    
    async _batchGetUsers(userIds) {
        // Try Redis first
        const pipeline = this.client.pipeline();
        userIds.forEach(id => pipeline.get(`user:${id}`));
        const results = await pipeline.exec();
        
        const users = [];
        const missingIds = [];
        
        for (let i = 0; i < results.length; i++) {
            const cached = results[i][1];
            if (cached) {
                try {
                    users.push(JSON.parse(cached));
                } catch {
                    missingIds.push(userIds[i]);
                }
            } else {
                missingIds.push(userIds[i]);
            }
        }
        
        // Fetch missing users from MongoDB
        if (missingIds.length > 0) {
            const dbUsers = await User.find({ _id: { $in: missingIds } }).lean();
            
            const cachePipeline = this.client.pipeline();
            dbUsers.forEach(user => {
                const key = `user:${user._id}`;
                cachePipeline.setex(key, 604800, JSON.stringify(user));
                users.push(user);
            });
            await cachePipeline.exec();
        }
        
        return users;
    }

    // ========== HELPER METHODS ==========
    
    async _addLikeCountsToTwis(twis) {
        const likePromises = twis.map(twi => 
            this.cache.like.getTwiLikeCount(twi._id || twi.twiId)
        );
        
        const likeCounts = await Promise.all(likePromises);
        
        for (let i = 0; i < twis.length; i++) {
            twis[i].likes = likeCounts[i];
        }
    }
    
    async _batchGetLikeCounts(tweetIds) {
        const promises = tweetIds.map(id => 
            this.cache.like.getTwiLikeCount(id)
        );
        return Promise.all(promises);
    }
    
    async _batchCheckLikedStatus(tweetIds, viewerId) {
        const promises = tweetIds.map(id => 
            this.cache.like.hasLiked(id, viewerId)
        );
        return Promise.all(promises);
    }
    
    async _getFollowStatus(viewerId, userId) {
        if (!viewerId || viewerId === userId) {
            return [false, false];
        }
        
        const [isFollowing, followsYou] = await Promise.all([
            this.cache.follow.isFollowing(viewerId, userId),
            this.cache.follow.isFollowing(userId, viewerId)
        ]);
        
        return [isFollowing, followsYou];
    }
    
    _createTwiCacheData(twi, userId) {
        return {
            twiId: twi.twiId || twi._id || '',
            text: twi.content?.text || '',
            likes: twi.likes || 0,
            comments: twi.comments || 0,
            shares: twi.shares || 0,
            attachment: (twi.content?.attachment || false).toString(),
            image: twi.content?.image || '',
            aspectClass: twi.content?.aspectClass || '',
            deleteUrl: twi.content?.deleteUrl || '',
            createdAt: twi.createdAt?.toISOString() || new Date().toISOString(),
            authorUserId: userId,
            authorUsername: twi.author?.username || '',
            authorImage: twi.author?.image || '',
            authorName: twi.author?.name || ''
        };
    }
    
    async _cacheUserData(user) {
        const userKey = `user:${user._id}`;
        const userFields = {
            _id: user._id.toString(),
            username: user.username,
            password: user.password,
            remember: (user.remember || false).toString(),
            recoveryKeys: JSON.stringify(user.recoveryKeys || []),
            role: user.role,
            image: user.image,
            bio: user.bio,
            refreshToken: user.refreshToken || "",
            createdAt: user.createdAt
        };
        
        await this.hset(userKey, 604800, ...Object.entries(userFields).flat());
    }
    
    _formatCachedUser(cached, token) {
        return {
            _id: cached._id || token,
            username: cached.username,
            password: cached.password,
            remember: cached.remember === 'true',
            recoveryKeys: JSON.parse(cached.recoveryKeys || "[]"),
            role: cached.role,
            image: cached.image,
            bio: cached.bio,
            refreshToken: cached.refreshToken || null,
            createdAt: cached.createdAt
        };
    }
}

export default UserCache;