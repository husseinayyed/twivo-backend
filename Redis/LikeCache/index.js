
import LikeGetCache from "./LikeGet.js";
import LikeSetCache from "./LikeSet.js";



class LikeCache {
    constructor(client, cacheService) {
        this.get = new LikeGetCache(client, cacheService);
        this.set = new LikeSetCache(client, cacheService);
    }
}

export default LikeCache;