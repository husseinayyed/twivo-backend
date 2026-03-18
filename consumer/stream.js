import Cache from "../utils/cache.js";
async function startReading() {
    const STREAM = "media_stream";
    const GROUP = "backend";
    const CONSUMER = "server-1";
    while(true) {
        const response = await Cache.blockingClient.xreadgroup(
            "GROUP",GROUP,CONSUMER,"COUNT","20","BLOCK","0","STREAMS",STREAM,">"
        );
        if (response && response.length > 0) {
        for (const stream of response) {
          const [STREAM, messages] = stream;
          
          for (const message of messages) {
            const [id, fields, idleTime, deliveryCount] = message;
         
            
            try {
              await processMessage(fields);
              await Cache.client.xack(STREAM, GROUP, id);
            } catch (error) {
              console.error(`Failed ${id}:`, error);
            }
          }
        }
    }
}
}
async function processMessage(fields) {
    console.log(fields)
}
export default startReading;