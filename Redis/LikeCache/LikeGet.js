
import { Like } from "../../models/like.js";
import { likeStatusInternalMethods } from "./LikeStatusInternal.js";
import { likeCountInternalMethods } from "./LikeCountInternal.js";
import { likeListInternalMethods } from "./LikeListInternal.js";

class LikeGetCache {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
    Object.assign(this, likeStatusInternalMethods, likeCountInternalMethods, likeListInternalMethods);
  }

}

export default LikeGetCache;