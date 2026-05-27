import { Twi } from "../../../models/twi.js"
import Cache from "../../../utils/cache.js"

class UserMakerCacheClass {
    constructor() {}
    async addTwiToUserDB(userId, text, attachment, image, aspectClass, twiId) {
        try {
            const twiData = {
                madeBy: userId,
                text: text,
                attachment: attachment,
                aspectClass: aspectClass,
                image: image,
                likes: 0,
                comments: 0
            };

            // If twiId is provided (e.g. from the stream consumer), use it
            if (twiId) {
                twiData._id = twiId;
            }

            const twi = await Twi.create(twiData);
            
            // 1. Add to user's personal list
            await Cache.user.set.addTwiToUserCache(twi);
            
            // 2. Add to global generic feed cache so it appears for others immediately
            await Cache.twi.set.addToFeedCache(twi);
            
            return true;
        } catch (error) {
            console.log("Maker error:" + error)
            return null;
        }
    }
}
const UserMakerCache = new UserMakerCacheClass()
export default UserMakerCache;