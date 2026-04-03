import { Queue } from "bullmq";

const myQueue = new Queue("twi-maker");
class TwiQueueClass {
  constructor() {}
  async addTwiToQueue(text, userId, attachment, mediaPath, orientation,twiId) {
    await myQueue.add("twi-maker", {
      text,
      userId,
      attachment,
      mediaPath,
      orientation,
      twiId
    });
  }
}
const TwiQueue = new TwiQueueClass();
export default TwiQueue;
