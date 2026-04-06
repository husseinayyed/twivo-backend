import { addTwiToQueue } from "../queue/Twi/Twi.js";
import UserMakerCache from "../Redis/Maker/DB/UserMakerCache.js";
import Cache from "../utils/cache.js";
async function startReading() {
  const STREAM = "uploads:stream";
  const GROUP = "backend";
  const CONSUMER = "server-1";
  while (true) {
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
      ">",
    );
    if (response && response.length > 0) {
      for (const stream of response) {
        const [STREAM, messages] = stream;

        for (const message of messages) {
          const [id, fields, idleTime, deliveryCount] = message;
          
          try {
            await processMessage(id, fields);
            await Cache.client.xack(STREAM, GROUP, id);
          } catch (error) {
            console.error(`Failed ${id}:`, error);
          }
        }
      }
    }
  }
}
async function processMessage(id, fields) {
  try {
    const streamData = {};
    for (let i = 0; i < fields.length; i += 2) {
      streamData[fields[i]] = fields[i + 1];
    }

    const twiId = streamData.twiId || streamData.id || streamData.twi || streamData.twi_id;
    const userId = streamData.userId || streamData.user || streamData.user_id;
    const mediaPath = streamData.mediaPath || streamData.path || streamData.filePath || streamData.media_path;
    const orientation = streamData.orientation || streamData.angle || streamData.orient;
    const attachment = true;

    if (!twiId) {
      throw new Error(`Missing twiId in stream message ${id}: ${JSON.stringify(fields)}`);
    }
    if (!userId) {
      throw new Error(`Missing userId in stream message ${id}: ${JSON.stringify(fields)}`);
    }

    const textField = await Cache.client.hgetall(`twi:${twiId}`);
    if (!textField || !textField.text) {
      throw new Error(`Missing text for twi:${twiId}; stream fields=${JSON.stringify(fields)}; cached=${JSON.stringify(textField)}`);
    }
    const text = textField.text;

    await addTwiToQueue(text, userId, attachment, mediaPath, orientation, twiId);
  } catch (error) {
    console.log(error);
    return null;
  }
}
export default startReading;