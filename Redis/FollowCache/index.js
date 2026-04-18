import FollowGet from "./FollowGet.js";
import FollowSet from "./FollowSet.js";



class FollowCache {
    constructor(client, cacheService) {
        this.get = new FollowGet(client, cacheService);
        this.set = new FollowSet(client, cacheService);
    }
}

export default FollowCache;