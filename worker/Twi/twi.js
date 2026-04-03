import { Worker } from "bullmq";
import Cache from "../../utils/cache.js";
import UserMakerCache from "../../Redis/Maker/DB/UserMakerCache.js";
import { connectDB, getDbStatus } from "../../utils/db.js";

// Get the Redis client and extract options
const redisClient = Cache.blockingClient;
const connection = {
  host: redisClient.options.host,
  port: redisClient.options.port,
  password: redisClient.options.password,
  db: redisClient.options.db,
  family: redisClient.options.family,
  keepAlive: redisClient.options.keepAlive,
  noDelay: redisClient.options.noDelay,
  maxRetriesPerRequest: null,  // Critical for BullMQ
};
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
  { connection },
);

export default worker;