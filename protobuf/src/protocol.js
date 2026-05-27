import { Buffer } from 'node:buffer';

/**
 * Compiles a high-performance columnar binary feed payload.
 * 
 * PROTOCOL SPECIFICATION (Little-Endian):
 * =======================================
 * [HEADER SECTION]
 * - Offset 0 (2 bytes): Post Count (uint16)
 * - Offset 2 (2 bytes): Padding/Alignment (reserved, 0x00)
 * 
 * [METADATA COLUMN: LIKES]
 * - Offset 4 (postCount * 4 bytes): Array of uint32 like counts
 * 
 * [METADATA COLUMN: COMMENTS]
 * - Offset (4 + likesSize) (postCount * 4 bytes): Array of uint32 comment counts
 * 
 * [METADATA COLUMN: FLAGS]
 * - Offset (4 + likesSize + commentsSize) (postCount * 1 byte): Bitmask flags per post
 *   - 0x01: isLiked (Current user liked this)
 *   - 0x02: isFollowing (Current user follows author)
 * 
 * [BODY SECTION: BLOB DATA]
 * - Sequential blobs per post:
 *   - Length prefix (4 bytes, uint32): Size of the following Protobuf message
 *   - Protobuf Payload (N bytes): The actual Twi message data
 */
export default function compileColumnarFeedLEAligned(twis, likes, comments, liked, followMap) {
  const postCount = twis.length;
  
  // Calculate specific column sizes
  const likesSize = postCount * 4;    // 4 bytes per uint32
  const commentsSize = postCount * 4; // 4 bytes per uint32
  const flagsSize = postCount * 1;    // 1 byte per bitmask
  const totalHeaderSize = 4 + likesSize + commentsSize + flagsSize;

  // Calculate total body size (Protobuf blobs + their length prefixes)
  let totalBodySize = 0;
  for (let i = 0; i < postCount; i++) {
    totalBodySize += 4 + twis[i].length;
  }

  // Allocate single contiguous buffer for zero-copy performance
  const payloadBuffer = Buffer.allocUnsafe(totalHeaderSize + totalBodySize);

  // 1. Write Header
  payloadBuffer.writeUInt16LE(postCount, 0);
  payloadBuffer.writeUInt16LE(0, 2); // 16-bit alignment padding

  let likesPtr = 4; 
  let commentsPtr = 4 + likesSize;
  let flagsPtr = 4 + likesSize + commentsSize;

  // 2. Write Metadata Columns (Columnar storage)
  for (let i = 0; i < postCount; i++) {
    // Write Like count
    payloadBuffer.writeUInt32LE(likes[i], likesPtr);
    likesPtr += 4;

    // Write Comment count
    payloadBuffer.writeUInt32LE(comments[i], commentsPtr);
    commentsPtr += 4;

    // Pack booleans into bitmask flags
    let bitmask = 0x00;
    if (liked[i])     bitmask |= 0x01; 
    if (followMap[i]) bitmask |= 0x02; 
    
    payloadBuffer[flagsPtr] = bitmask;
    flagsPtr += 1;
  }

  // 3. Write Body Blobs (Sequential storage)
  let bodyPtr = totalHeaderSize;
  for (let i = 0; i < postCount; i++) {
    const protoBuffer = twis[i];
    const protoLength = protoBuffer.length;

    // Length prefix (uint32) followed by raw bytes
    payloadBuffer.writeUInt32LE(protoLength, bodyPtr);
    protoBuffer.copy(payloadBuffer, bodyPtr + 4);
    bodyPtr += 4 + protoLength;
  }

  return payloadBuffer;
}