import { Queue } from "bullmq";
import Cache from "../../utils/cache.js";

const TwiQueue = new Queue("twi-maker", {
  connection: Cache.queueConnection
});

export async function addTwiToQueue(text, userId, attachment, mediaPath, orientation, twiId) {
 console.log(twiId,text)
 return await TwiQueue.add("twi-maker", {
    text,
    userId,
    attachment,
    mediaPath,
    orientation,
    twiId
  });
}
