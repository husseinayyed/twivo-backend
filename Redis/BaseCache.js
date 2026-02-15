class BaseCache {
    constructor(client) {
        this.client = client

    }
    async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error("Error getting cache:", error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      await this.client.set(key, JSON.stringify(value), "EX", ttl);
    } catch (error) {
      console.error("Error setting cache:", error);
    }
  }

  async hset(hash, expire, ...value) {
    try {
      await this.client.hset(hash, ...value);
      await this.client.expire(hash, expire);
    } catch (error) {
      console.error("Error setting hash cache:", error);
    }
  }

  async hgetall(hash) {
    try {
      return await this.client.hgetall(hash);
    } catch (error) {
      console.error("Error getting hash cache:", error);
      return null;
    }
  }

  async exists(key) {
    try {
      return (await this.client.exists(key)) === 1;
    } catch (error) {
      console.error("Error checking cache existence:", error);
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error("Error deleting cache:", error);
    }
  }

  async sadd(key, member) {
    try {
      return await this.client.sadd(key, member);
    } catch (error) {
      console.error("Error adding to set:", error);
      return 0;
    }
  }

  async srem(key, member) {
    try {
      return await this.client.srem(key, member);
    } catch (error) {
      console.error("Error removing from set:", error);
      return 0;
    }
  }

  async sismember(key, member) {
    try {
      return await this.client.sismember(key, member);
    } catch (error) {
      console.error("Error checking set membership:", error);
      return null;
    }
  }

  async smembers(key) {
    try {
      return await this.client.smembers(key);
    } catch (error) {
      console.error("Error getting set members:", error);
      return [];
    }
  }

  async scard(key) {
    try {
      return await this.client.scard(key);
    } catch (error) {
      console.error("Error getting set count:", error);
      return 0;
    }
  }

  async expire(key, seconds) {
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error("Error setting expiry:", error);
      return 0;
    }
  }

}
export default BaseCache;