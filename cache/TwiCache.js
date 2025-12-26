import BaseCache from './BaseCache.js';
import { Twi } from "../models/twi.js";

class TwiCache extends BaseCache {
    constructor(client, cacheService) {
        super(client);
        this.cache = cacheService;
    }

    // ========== CORE PUBLIC METHODS ==========
    
    async getContent(tweetId, userId) {
        try {
            // Try cache first
            const cached = await this._getCachedContent(tweetId, userId);
            if (cached) return cached;
            
            // If not in cache, fetch from DB
            return await this._fetchFromDatabaseAndCache(tweetId, userId);
        } catch (error) {
            console.error("Error getting content:", error);
            return null;
        }
    }

    async getFeed(userId) {
        const start = Date.now();
        try {
            // Try to get cached feed
            const cachedFeedJson = await this.client.lrange("feed:generic", 0, 19);
            
            if (cachedFeedJson && cachedFeedJson.length > 0) {
                // Parse generic feed (no personal data)
                const genericFeeds = cachedFeedJson
                    .map(json => {
                        try { return JSON.parse(json); } 
                        catch { return null; }
                    })
                    .filter(Boolean);
                
                // Add personalization for THIS user
                const personalizedFeeds = await this._addPersonalization(genericFeeds, userId);
                console.log(`✅ CACHE HIT: ${Date.now() - start}ms`);
                return personalizedFeeds;
            }
            
            // No cache, generate fresh feed
            console.log("🔄 Generating fresh feed...");
            const fresh = await this._generateFreshFeed(userId, start);
            return fresh;
        } catch (error) {
            console.error("Error getting feed:", error);
            return await this._generateFreshFeed(userId, Date.now());
        }
    }

    // ========== CORE PRIVATE METHODS ==========
    
    async _getCachedContent(tweetId, userId) {
        const tweetKey = `twi:${tweetId}`;
        
        // Get tweet from Redis
        const tweetData = await this.client.hgetall(tweetKey);
        if (!tweetData || !tweetData._id) return null;
        
        // Check if user liked this tweet - USE CACHE SERVICE
        const isLiked = await this.cache.like.hasLiked(tweetId, userId);
        
        // Check if user follows author - USE CACHE SERVICE
        let isFollowing = false;
        if (tweetData.authorUserId) {
            isFollowing = await this.cache.follow.isFollowing(userId, tweetData.authorUserId);
        }
        
        // Format the response
        return {
            _id: tweetData._id,
            myself: userId === tweetData.authorUserId,
            text: tweetData.text || '',
            likes: parseInt(tweetData.likes) || 0,
            comments: parseInt(tweetData.comments) || 0,
            attachment: tweetData.attachment === 'true',
            image: tweetData.image || '',
            aspectClass: tweetData.aspectClass || '',
            deleteUrl: tweetData.deleteUrl || '',
            createdAt: tweetData.createdAt,
            authorUserId: tweetData.authorUserId || '',
            authorUsername: tweetData.authorUsername || '',
            authorImage: tweetData.authorImage || '',
            isLiked,
            isFollowing
        };
    }

    async _fetchFromDatabaseAndCache(tweetId, userId) {
        // Fetch from MongoDB
        const tweet = await Twi.findById(tweetId).lean();
        if (!tweet) return null;
        
        const authorId = tweet.author?.userId?.toString();
        if (!authorId) return null;
        
        // Check like and follow status - USE CACHE SERVICE
        const [isLiked, isFollowing] = await Promise.all([
            this.cache.like.hasLiked(tweetId, userId),
            this.cache.follow.isFollowing(userId, authorId)
        ]);
        
        // Create cache data
        const cacheData = this._createCacheData(tweet);
        
        // Save to Redis
        const pipeline = this.client.pipeline();
        pipeline.hset(`twi:${tweetId}`, cacheData);
        pipeline.expire(`twi:${tweetId}`, 300);
        pipeline.sadd(`user:${authorId}:twis`, JSON.stringify(cacheData));
        pipeline.expire(`user:${authorId}:twis`, 300);
        await pipeline.exec();
        
        // Return formatted response
        const content = tweet.content || {};
        return {
            _id: tweet._id.toString(),
            myself: userId === authorId,
            text: content.text || '',
            likes: tweet.likes || 0,
            comments: tweet.comments || 0,
            attachment: content.attachment || false,
            image: content.image || '',
            aspectClass: content.aspectClass || '',
            deleteUrl: content.deleteUrl || '',
            createdAt: tweet.createdAt.toISOString(),
            authorUserId: authorId,
            authorUsername: tweet.author?.username || '',
            authorImage: tweet.author?.image || '',
            isLiked,
            isFollowing
        };
    }

    async _generateFreshFeed(userId, startTime) {
        // Get random tweets from MongoDB
        const tweets = await Twi.aggregate([
            { $sample: { size: 20 } },
            { $sort: { createdAt: -1 } }
        ]);
        
        if (!tweets.length) return [];
        
        // Create generic tweets (no personal data)
        const genericTweets = tweets.map(tweet => {
            const tweetId = tweet._id.toString();
            const authorId = tweet.author?.userId?.toString(); // Convert ObjectId to string
            
            return {
                _id: tweetId,
                content: tweet.content || {},
                author: {
                    ...tweet.author,
                    userId: authorId // Store as string
                },
                comments: tweet.comments || 0,
                createdAt: tweet.createdAt
                // NO: likes, isLiked, isFollowing, followsYou, myself
            };
        });
        
        // Cache generic feed
        await this.cacheGenericFeed(genericTweets);
        
        // Add personalization for current user
        const personalizedFeed = await this._addPersonalization(genericTweets, userId);
        
        console.log(`✅ FRESH FEED: ${Date.now() - startTime}ms`);
        return personalizedFeed;
    }

    async _addPersonalization(genericTweets, userId) {
        if (!genericTweets.length) return [];
        
        // Convert userId to string for comparison
        const userIdStr = userId.toString();
        
        const tweetIds = genericTweets.map(t => t._id || t._id);
        const authorIds = genericTweets.map(t => {
            // Convert ObjectId to string
            const authorId = t.author?.userId;
            return authorId ? authorId.toString() : null;
        }).filter(Boolean);
        
        const uniqueAuthors = [...new Set(authorIds.filter(id => id !== userIdStr))];
        
        // Batch ALL operations using cache service
        const [likeCounts, likedStatuses, followStatuses] = await Promise.all([
            // Get like counts - USE CACHE SERVICE
            Promise.all(tweetIds.map(id => this.cache.like.getTwiLikeCount(id))),
            
            // Check liked status - USE CACHE SERVICE
            Promise.all(tweetIds.map(id => this.cache.like.hasLiked(id, userId))),
            
            // Get follow status for all unique authors - USE CACHE SERVICE
            this._batchGetFollowStatus(userIdStr, uniqueAuthors)
        ]);
        
        // Build personalized tweets
        return genericTweets.map((tweet, index) => {
            const authorId = authorIds[index];
            const authorFollowStatus = authorId ? followStatuses[authorId] : null;
            
            return {
                ...tweet,
                likes: likeCounts[index],
                isLiked: likedStatuses[index],
                isFollowing: authorFollowStatus?.isFollowing || false,
                followsYou: authorFollowStatus?.followsYou || false,
                myself: userIdStr === authorId // String comparison
            };
        });
    }

    async _batchGetFollowStatus(viewerId, authorIds) {
        if (authorIds.length === 0) return {};
        
        const followStatus = {};
        
        // Use cache service methods
        const followPromises = authorIds.map(authorId => 
            Promise.all([
                this.cache.follow.isFollowing(viewerId, authorId),
                this.cache.follow.isFollowing(authorId, viewerId)
            ]).then(([isFollowing, followsYou]) => ({
                authorId, isFollowing, followsYou
            }))
        );
        
        const results = await Promise.all(followPromises);
        results.forEach(result => {
            followStatus[result.authorId] = {
                isFollowing: result.isFollowing,
                followsYou: result.followsYou
            };
        });
        
        return followStatus;
    }

    async cacheGenericFeed(tweets) {
        const pipeline = this.client.pipeline();
        
        tweets.forEach(tweet => {
            // Make sure author.userId is a string when caching
            const tweetForCache = {
                ...tweet,
                author: {
                    ...tweet.author,
                    userId: tweet.author?.userId?.toString() || ''
                }
            };
            
            // Only cache non-personal data
            pipeline.lpush("feed:generic", JSON.stringify(tweetForCache));
            // pipeline.lpush(`user:${tweet.author}`, JSON.stringify(tweetForCache));
            const tweetId = tweet._id || tweet._id;
            if (tweetId) {
                pipeline.hset(`twi:${tweetId}`, {
                    _id: tweetId,
                    text: tweet.content?.text || '',
                    comments: (tweet.comments || 0).toString(),
                    attachment: (tweet.content?.attachment || false).toString(),
                    image: tweet.content?.image || '',
                    aspectClass: tweet.content?.aspectClass || '',
                    deleteUrl: tweet.content?.deleteUrl || '',
                    createdAt: tweet.createdAt?.toISOString(),
                    authorUserId: tweet.author?.userId?.toString() || '', // Store as string
                    authorUsername: tweet.author?.username || '',
                    authorImage: tweet.author?.image || ''
                });
                pipeline.expire(`twi:${tweetId}`, 300);
            }
        });
        
        await pipeline.exec();
        await this.client.ltrim("feed:generic", 0, 19);
        await this.client.expire("feed:generic", 300);
    }
    // Add to TwiCache class:
async addToFeedCache(tweet) {
    try {
        const tweetData = {
            _id: tweet._id.toString(),
            content: tweet.content || {},
            author: tweet.author || {},
            comments: tweet.comments || 0,
            createdAt: tweet.createdAt
        };
        
        // Add to beginning of feed cache
        await this.client.lpush("feed:generic", JSON.stringify(tweetData));
        
        // Trim to keep only 20 items
        await this.client.ltrim("feed:generic", 0, 19);
        
        // Cache individual tweet
        const tweetId = tweet._id.toString();
        await this.client.hset(`twi:${tweetId}`, this._createCacheData(tweet));
        await this.client.expire(`twi:${tweetId}`, 300);
        
        console.log(`✅ Added tweet ${tweetId} to feed cache`);
    } catch (error) {
        console.error("Error adding to feed cache:", error);
    }
}

    // ========== UTILITY METHODS ==========
    
    _createCacheData(tweet) {
        const content = tweet.content || {};
        const author = tweet.author || {};
        
        return {
            _id: tweet._id?.toString() || tweet._id || '',
            text: content.text || '',
            likes: (tweet.likes || 0).toString(),
            comments: (tweet.comments || 0).toString(),
            attachment: (content.attachment || false).toString(),
            image: content.image || '',
            aspectClass: content.aspectClass || '',
            deleteUrl: content.deleteUrl || '',
            createdAt: tweet.createdAt?.toISOString() || new Date().toISOString(),
            authorUserId: author.userId?.toString() || '', // Convert to string
            authorUsername: author.username || '',
            authorImage: author.image || ''
        };
    }

    // ========== SIMPLE HELPER ==========
    
    async clearFeedCache() {
        try {
            await this.client.del("feed:generic");
        } catch (error) {
            console.error("Error clearing feed cache:", error);
        }
    }
}

export default TwiCache;