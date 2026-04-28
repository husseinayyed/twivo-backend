import { addTwiToQueue } from "../queue/Twi/Twi.js";
import Cache from "../utils/cache.js";

async function startReading() {
  const STREAM = "uploads:stream";
  const GROUP = "backend";
  const CONSUMER = "server-1";

  // Ensure the consumer group exists (Best practice)
  try {
    await Cache.client.xgroup("CREATE", STREAM, GROUP, "0", "MKSTREAM");
  } catch (e) {
    // Group already exists, ignore
  }

  while (true) {
    try {
      const response = await Cache.blockingClient.xreadgroup(
        "GROUP", GROUP, CONSUMER,
        "COUNT", "20",
        "BLOCK", "0",
        "STREAMS", STREAM, ">"
      );

      if (!response) continue;

      for (const [streamName, messages] of response) {
        await Promise.all(
          messages.map(async ([id, fields]) => {
            try {
              // 1. Parse fields into an object
              const streamData = {};
              for (let i = 0; i < fields.length; i += 2) {
                streamData[fields[i]] = fields[i + 1];
              }

              const { twiId, userId, mediaPath, orientation } = normalizeData(streamData);

              if (!twiId || !userId) {
                console.error(`Skipping message ${id}: Missing required ID fields.`);
                return await Cache.client.xack(streamName, GROUP, id); // Remove invalid data
              }

              const textField = await Cache.client.hgetall(`twi:${twiId}`);
              if (!textField?.text) throw new Error(`Text missing for ${twiId}`);

              // 2. Add to BullMQ with Retry Options
              // We pass the retry config here to the producer!
              await addTwiToQueue(
                textField.text,
                userId,
                true,
                mediaPath,
                orientation,
                twiId,
                {
                  attempts: 5, // Retry up to 5 times
                  backoff: {
                    type: "exponential",
                    delay: 2000, // Start with 2s wait
                  },
                  removeOnComplete: true
                }
              );

              // 3. ONLY ACK after it's safely in the BullMQ queue
              await Cache.client.xack(streamName, GROUP, id);

            } catch (error) {
              console.error(`Critical error processing stream message ${id}:`, error);
              // Note: We do NOT XACK here. 
              // Redis Streams will keep this in the PEL (Pending Entries List)
              // so it can be claimed by another consumer later.
            }
          })
        );
      }
    } catch (err) {
      console.error("Stream read error:", err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Helper to clean up the field mapping logic
function normalizeData(data) {
    return {
        twiId: data.twiId || data.id || data.twi || data.twi_id,
        userId: data.userId || data.user || data.user_id,
        mediaPath: data.mediaPath || data.path || data.filePath || data.media_path,
        orientation: data.orientation || data.angle || data.orient
    };
}

export default startReading;