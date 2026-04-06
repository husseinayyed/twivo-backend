import { Queue } from "bullmq";

const myQueue = new Queue("twi-maker");

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
