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
    const userId = fields[3];
    const mediaPath = fields[5];
    const orientation = fields[7];
    const textField = await Cache.client.hgetall(`twi:${id}`);
    if (!textField) throw new Error("Not found " + id);
    const text = textField.text;
    console.log(`Processing image for user ${userId}`);
    console.log(`Image path: ${mediaPath}`);
    console.log(`Orientation: ${orientation}`);
    await UserMakerCache.addTwiToUserDB(userId, text, true, mediaPath, orientation);
  } catch (error) {
    console.log(error);
    return null;
  }
}
export default startReading;