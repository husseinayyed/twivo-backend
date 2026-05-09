import SchemaCache from "../schemas.js";
import { User } from "../../models/user.js";

export const profileInternalMethods = {
  async _getCachedUser(token, myself = false) {
    const key = myself ? `user:${token}` : `user:${token}:public`;

    const exists = await this.client.exists(key);
    if (!exists) return null;

    const cached = await this.client.get(key);
    if (!cached?.username) return null;

    return cached;
  },

  async _getCachedUserByMethod(method, token) {
    const key =
      method === "email"
        ? `user:email:${token}`
        : `user:username:${token}`;

    const exists = await this.client.exists(key);
    if (!exists) return null;

    return await this.client.get(key);
  },

  async _batchGetUsers(userIds) {
    const pipeline = this.client.pipeline();
    userIds.forEach((id) => pipeline.get(`user:${id}`));

    const results = await pipeline.exec();

    const users = [];
    const missing = [];

    for (let i = 0; i < results.length; i++) {
      const [err, data] = results[i];

      if (!err && data) {
        try {
          users.push(JSON.parse(data));
        } catch {
          missing.push(userIds[i]);
        }
      } else {
        missing.push(userIds[i]);
      }
    }

    if (missing.length) {
      const dbUsers = await this._fetchUsersFromDB(missing);
      users.push(...dbUsers);
    }

    return users;
  },

  async _fetchUsersFromDB(userIds) {
    const dbUsers = await User.find({ _id: { $in: userIds } }).lean();

    return dbUsers.map((u) => ({
      ...SchemaCache.createUserCacheData(u),
    }));
  },

  async _fetchAndCacheUser(token) {
    try {
      const user = await User.findById(token);
      if (!user) return null;

      this.cache.user.set.cacheUserData(user).catch(console.error);

      return user;
    } catch (err) {
      console.error("_fetchAndCacheUser error:", err);
      return null;
    }
  },

  async _fetchAndCacheUserByMethod(method, token) {
    try {
      let user;

      if (method === "email") {
        user = await User.findOne({ email: token });
      } else {
        user = await User.findOne({ username: token });
      }

      if (!user) return null;

      this.cache.user.set.cacheUserData(user).catch(console.error);

      return user; // ❗ FIXED (was userData bug)
    } catch (err) {
      console.error("_fetchAndCacheUserByMethod error:", err);
      return null;
    }
  },
};