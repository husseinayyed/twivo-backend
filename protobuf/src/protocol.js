import { Buffer } from 'node:buffer';

export default function compileColumnarFeedLEAligned(twis, likes, liked, followMap) {
  const postCount = twis.length;
  const likesSize = postCount * 4;
  const flagsSize = postCount * 1;
  const totalHeaderSize = 4 + likesSize + flagsSize;

  let totalBodySize = 0;
  for (let i = 0; i < postCount; i++) {
    totalBodySize += 4 + twis[i].length;
  }

  const payloadBuffer = Buffer.allocUnsafe(totalHeaderSize + totalBodySize);

  payloadBuffer.writeUInt16LE(postCount, 0);
  payloadBuffer.writeUInt16LE(0, 2); 

  let likesPtr = 4; 
  let flagsPtr = 4 + likesSize;

  for (let i = 0; i < postCount; i++) {
    payloadBuffer.writeUInt32LE(likes[i], likesPtr);
    likesPtr += 4;

    let bitmask = 0x00;
    if (liked[i])     bitmask |= 0x01; 
    if (followMap[i]) bitmask |= 0x02; 
    
    payloadBuffer[flagsPtr] = bitmask;
    flagsPtr += 1;
  }

  let bodyPtr = totalHeaderSize;
  for (let i = 0; i < postCount; i++) {
    const protoBuffer = twis[i];
    const protoLength = protoBuffer.length;

    payloadBuffer.writeUInt32LE(protoLength, bodyPtr);
    protoBuffer.copy(payloadBuffer, bodyPtr + 4);
    bodyPtr += 4 + protoLength;
  }

  return payloadBuffer;
}