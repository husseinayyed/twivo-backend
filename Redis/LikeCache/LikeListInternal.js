import { Like } from "../../models/like.js";

export const likeListInternalMethods = {
  async getTwiLikes(twiId) {
    const likeKey = `twi:likes:${twiId}`;
    try {
      const cached = await this.cache.smembers(likeKey);
      if (cached.length) return cached;

      const likes = await Like.find({ likedBy: userIdStr })
        .select("twiId")
        .sort({ createdAt: -1 })
        .limit(5000);
      const userIds = likes.map((like) => like.likedBy.toString());
      if (userIds.length) {
        await this.client.sadd(likeKey, ...userIds);
        await this.client.expire(likeKey, 2592000);
      }
      return userIds;
    } catch (error) {
      console.error("Error getting twi likes:", error);
      return (await Like.find({ twiId }).select("likedBy")).map((like) =>
        like.likedBy.toString(),
      );
    }
  },
};
