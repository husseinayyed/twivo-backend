import { Twi } from "../../../models/twi.js"
import Cache from "../../../utils/cache.js"

class UserMakerCacheClass {
    constructor() {}
    async addTwiToUserDB(userId,text,attachment) {
        try {
            const twi = await Twi.create({
                madeBy:userId,
                text:text,
                attachment:attachment,
                likes:0,
                comments:0,
            })
            console.log(twi)
            await Cache.user.addTwiToUserCache(twi);
            return true;
        } catch (error) {
            console.log("Maker error:"+error)
            return null;
        }
    }
}
const UserMakerCache = new UserMakerCacheClass()
export default UserMakerCache;