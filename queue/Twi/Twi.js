import { Queue } from "bullmq";
import Cache from "../../utils/cache.js";

const myQueue = new Queue("twi-maker", {
  connection: Cache.blockingClient
});

export async function addTwiToQueue(text, userId, attachment, mediaPath, orientation, twiId) {
  await myQueue.add("twi-maker", {
    text,
    userId,
    attachment,
    mediaPath,
    orientation,
    twiId
  });
}
