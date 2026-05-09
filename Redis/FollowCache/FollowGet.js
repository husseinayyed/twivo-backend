import { Follow } from "../../models/follow.js";
import { followStatusInternalMethods } from "./FollowStatusInternal.js";
import { followStatsInternalMethods } from "./FollowStatsInternal.js";

class FollowGet {
  constructor(client, cacheService) {
    this.client = client;
    this.cache = cacheService;
    Object.assign(this, followStatusInternalMethods, followStatsInternalMethods);
  }

}

export default FollowGet;