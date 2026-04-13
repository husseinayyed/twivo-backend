import TwiGet from "./TwiGet.js";
import TwiSet from "./TwiSet.js";

class TwiCache {
  constructor(client, cacheService) {
    this.get = new TwiGet(client, cacheService);
    this.set = new TwiSet(client, cacheService);
  }
}

export default TwiCache;