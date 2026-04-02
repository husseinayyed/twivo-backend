import { Queue } from 'bullmq';

const myQueue = new Queue('twi-maker');

async function addTwiToQueue(text,userId,attachment,mediaPath,orientation) {
    await myQueue.add("twi-maker",{text,userId,attachment,mediaPath,orientation})
}

export default addTwiToQueue