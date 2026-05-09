export const followStatsInternalMethods = {
  async getFollowStats(userId) {
    try {
      const [following, followers] = await Promise.all([
        this.client.scard(`user:${userId}:following`),
        this.client.scard(`user:${userId}:followers`),
      ]);

      return {
        following: following || 0,
        followers: followers || 0,
      };
    } catch (error) {
      console.error("Error getting follow stats:", error);
      return { following: 0, followers: 0 };
    }
  },
};