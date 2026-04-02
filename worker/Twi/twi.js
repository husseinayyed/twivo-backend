import { Worker } from "bullmq";
import Cache from "../../utils/cache";
import UserMakerCache from "../../Redis/Maker/DB/UserMakerCache.js";

const connection = Cache.blockingClient;
const worker = new Worker(
  "twi-maker",
  async (job) => {
    try {
      await UserMakerCache.addTwiToUserDB(
        job.data.userId,
        job.data.text,
        job.data.attachment,
        job.data.mediaPath,
        job.data.orientation,
      );
    } catch (error) {
      console.error("twi-maker job failed:", error);
      throw error; // bubble up for bullmq retry / failure handling
    }
  },
  { connection },
);

export default worker;
