import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { Like } from '../../models/like.js';
import { Twi } from '../../models/twi.js';
import Cache from '../../utils/cache.js';


export const likeQueue = new Queue('like-operations', { connection: Cache.queueConnection });

const likeWorker = new Worker('like-operations', async (job) => {
  const { action, twiId, userIdStr, metaHashKey, likeSetKey, userLikesKey } = job.data;

  try {
    if (action === 'LIKE') {
      await Like.create({ twiId, likedBy: userIdStr });
      await Twi.findByIdAndUpdate(twiId, { $inc: { likes: 1 } });
    } else if (action === 'UNLIKE') {
      await Like.deleteOne({ twiId, likedBy: userIdStr });
      await Twi.findByIdAndUpdate(twiId, { $inc: { likes: -1 } });
    }
  } catch (mongoError) {
    // If it's a parallel race condition that breached cache validation, rollback Redis
    if (mongoError.code === 11000 && action === 'LIKE') {
      const rollbackPipeline = Cache.client.pipeline();
      rollbackPipeline.srem(likeSetKey, userIdStr);
      rollbackPipeline.srem(userLikesKey, twiId);
      rollbackPipeline.hincrby(metaHashKey, 'likes', -1);
      await rollbackPipeline.exec();
    } else {
      throw mongoError; // BullMQ automatic retry machine triggers here
    }
  }
}, { 
  connection: Cache.queueConnection,
  concurrency: 100 // Process 100 writes concurrently out-of-the-box
});