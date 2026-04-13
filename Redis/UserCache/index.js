import UserGet from "./UserGet.js";
import UserSet from "./UserSet.js";

class TwiCache {
  constructor(client, cacheService) {
    this.get = new UserGet(client, cacheService);
    this.set = new UserSet(client, cacheService);
  }
}

export default TwiCache;