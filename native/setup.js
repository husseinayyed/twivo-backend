import { dlopen, ptr, FFIType } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";

// 1. Path Management
const LIB_PATH_PROTOBUF = "/app/native/build/libtwivo_native.so";
const LIB_PATH_BLAKE3 = "/app/native/build/libtwivo_blake3.so";
console.log(`[native/setup] loading blake3 from ${LIB_PATH_BLAKE3}`);
console.log(`[native/setup] loading protobuf from ${LIB_PATH_PROTOBUF}`);

// 2. Load Symbols
const { symbols: blake3Symbols } = dlopen(LIB_PATH_BLAKE3, {
  blake3_hash: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr],
    returns: FFIType.void,
  },
});

// const { symbols: protoSymbols } = dlopen(LIB_PATH_PROTOBUF, {
//   serializeInternalUser: {
//     args: [
//       FFIType.ptr,      // out_buf
//       FFIType.u64,      // out_limit
//       FFIType.ptr,      // id (encoded buffer)
//       FFIType.ptr,      // username (encoded buffer)
//       FFIType.ptr,      // email (encoded buffer)
//       FFIType.bool,     // isverified
//       FFIType.ptr,      // bio (encoded buffer)
//       FFIType.ptr,      // refreshToken (encoded buffer)
//       FFIType.ptr       // createdAt (encoded buffer)
//     ],
//     returns: FFIType.u64,
//   },
//   serializePublicUser: {
//     args: [
//       FFIType.ptr,      // out_buf
//       FFIType.u64,      // out_limit
//       FFIType.ptr,      // id (encoded buffer)
//       FFIType.ptr,      // username (encoded buffer)
//       FFIType.bool,     // isverified
//       FFIType.ptr,      // bio (encoded buffer)
//       FFIType.ptr       // createdAt (encoded buffer)
//     ],
//     returns: FFIType.u64,
//   },
// });

// 3. Performance Buffers
// 4KB is usually enough for a User object; shared to minimize GC.
const SHARED_PROTO_BUFFER = new Uint8Array(4096);
const PROTO_BUFFER_PTR = ptr(SHARED_PROTO_BUFFER);
const encoder = new TextEncoder();

/**
 * Blake3 Hashing Utility
 */
export function blake3_hash(data) {
  const buf = typeof data === "string" ? encoder.encode(data) : data;
  const resultBuffer = new Uint8Array(32);
  
  blake3Symbols.blake3_hash(ptr(buf), BigInt(buf.byteLength), ptr(resultBuffer));
  
  return Buffer.from(resultBuffer).toString("base64");
}

// /**
//  * Protobuf Serialization Wrapper
//  * Uses subarray() to avoid memory copying (Zero-Copy approach).
//  */
// export function protoSerializeUser(userData, isPublic) {
//   const limit = BigInt(SHARED_PROTO_BUFFER.byteLength);

//   // Encode strings to buffers for FFI compatibility
//   const id = typeof userData.id === "string" ? ptr(encoder.encode(userData.id + '\0')) : null;
//   const username = typeof userData.username === "string" ? ptr(encoder.encode(userData.username + '\0')) : null;
//   const email = typeof userData.email === "string" ? ptr(encoder.encode(userData.email + '\0')) : null;
//   const bio = userData.bio && typeof userData.bio === "string" ? ptr(encoder.encode(userData.bio + '\0')) : null;
//   const refreshToken = userData.refreshToken && typeof userData.refreshToken === "string" ? ptr(encoder.encode(userData.refreshToken + '\0')) : null;
//   const createdAt = typeof userData.createdAt === "string" ? ptr(encoder.encode(userData.createdAt + '\0')) : null;

//   const size = isPublic 
//     ? protoSymbols.serializePublicUser(
//         PROTO_BUFFER_PTR,
//         limit,
//         id,
//         username,
//         !!userData.isVerified,
//         bio,
//         createdAt
//       )
//     : protoSymbols.serializeInternalUser(
//         PROTO_BUFFER_PTR,
//         limit,
//         id,
//         username,
//         email,
//         !!userData.isVerified,
//         bio,
//         refreshToken,
//         createdAt
//       );

//   if (size === 0n) {
//     throw new Error("FFI Serialization Failed: Buffer overflow or invalid input.");
//   }

//   // .subarray() provides a view of the shared buffer. 
//   // Warning: If you need to store this long-term while the buffer is reused, 
//   // you must .slice() it then. For immediate Redis/Network pipe, subarray is faster.
//   return SHARED_PROTO_BUFFER.subarray(0, Number(size));
// }