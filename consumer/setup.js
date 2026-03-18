import Cache from "../utils/cache.js";

async function setup(stream, group) {
    try {
        await Cache.blockingClient.xgroup("CREATE", stream, group, '$', 'MKSTREAM');
        console.log(`✅ Group '${group}' created for stream '${stream}'`);
    } catch (error) {
        if (error.message.includes('BUSYGROUP')) {
            console.log(`ℹ️ Group '${group}' already exists for stream '${stream}'`);
        } else {
            console.error("❌ Error creating group:", error);
        }
    }
}

export default setup;