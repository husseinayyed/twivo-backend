import { addTwiToQueue } from "../queue/Twi/Twi.js";
import Cache from "../utils/cache.js";

async function startReading() {
  const STREAM = "uploads:stream";
  const GROUP = "backend";
  const CONSUMER = "server-1";

  while (true) {
    try {
      const response = await Cache.blockingClient.xreadgroup(
        "GROUP",
        GROUP,
        CONSUMER,
        "COUNT",
        "20",
        "BLOCK",
        "0",
        "STREAMS",
        STREAM,
        ">"
      );

      if (!response) continue;

      for (const stream of response) {
        const [streamName, messages] = stream;

        console.log(`Received batch: ${messages.length}`);

        // 🔥 BULK PROCESSING PER CHUNK
        await Promise.all(
          messages.map(async (message) => {
            const [id, fields] = message;

            try {
              const streamData = {};
              for (let i = 0; i < fields.length; i += 2) {
                streamData[fields[i]] = fields[i + 1];
              }

              const twiId =
                streamData.twiId ||
                streamData.id ||
                streamData.twi ||
                streamData.twi_id;

              const userId =
                streamData.userId ||
                streamData.user ||
                streamData.user_id;

              const mediaPath =
                streamData.mediaPath ||
                streamData.path ||
                streamData.filePath ||
                streamData.media_path;

              const orientation =
                streamData.orientation ||
                streamData.angle ||
                streamData.orient;

              const attachment = true;

              if (!twiId || !userId) {
                throw new Error(`Missing required fields in ${id}`);
              }

              const textField = await Cache.client.hgetall(`twi:${twiId}`);

              if (!textField?.text) {
                throw new Error(`Missing text for twi:${twiId}`);
              }

              const text = textField.text;

              // ⚠️ ACK inside each task is safer in parallel mode
              await Cache.client.xack(streamName, GROUP, id);

              // fire queue (don’t block stream)
              return addTwiToQueue(
                text,
                userId,
                attachment,
                mediaPath,
                orientation,
                twiId
              );

            } catch (error) {
              console.error(`Failed message ${id}:`, error);
            }
          })
        );
      }
    } catch (err) {
      console.error("Stream read error:", err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export default startReading;