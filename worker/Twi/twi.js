import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";
import Cache from "../../utils/cache.js";
import UserMakerCache from "../../Redis/Maker/DB/UserMakerCache.js";
import { connectDB, getDbStatus } from "../../utils/db.js";

console.log(`[Worker] Redis URL: ${process.env.REDIS_URL}`);
console.log(`[Worker] Initializing worker with blocking client...`);

try {
    await connectDB();
    console.log(`DB Status: ${getDbStatus()}`);
} catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
}
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
        job.data.twiId
      );
    } catch (error) {
      console.error("twi-maker job failed:", error);
      throw error;
    }
  },
  { connection: Cache.queueConnection },
);

export default worker;