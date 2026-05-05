import { dlopen, ptr, FFIType } from "bun:ffi";

// 1. Path Management
const LIB_PATH_BLAKE3 = "libtwivo_blake3.so";
const LIB_PATH_PROTOBUF = "libtwivo_native.so";

// 2. Load Symbols
const { symbols: blake3Symbols } = dlopen(LIB_PATH_BLAKE3, {
  blake3_hash: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr],
    returns: FFIType.void,
  },
});

const { symbols: protoSymbols } = dlopen(LIB_PATH_PROTOBUF, {
  serializeInternalUser: {
    args: [
      FFIType.ptr,      // out_buf
      FFIType.u64,      // out_limit
      FFIType.cstring,  // Changed from ptr to cstring
      FFIType.cstring,  // Changed from ptr to cstring
      FFIType.cstring,  // Changed from ptr to cstring
      FFIType.bool,     // isverified
      FFIType.cstring,  // Changed from ptr to cstring
      FFIType.cstring,  // Changed from ptr to cstring
      FFIType.cstring   // Changed from ptr to cstring
    ],
    returns: FFIType.u64,
  },
});

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

/**
 * Protobuf Serialization Wrapper
 * Uses subarray() to avoid memory copying (Zero-Copy approach).
 */
export function protoSerializeUser(userData, isPublic) {
  const limit = BigInt(SHARED_PROTO_BUFFER.byteLength);

  const size = isPublic 
    ? protoSymbols.serializePublicUser(
        PROTO_BUFFER_PTR,
        limit,
        userData.id,
        userData.username,
        !!userData.isVerified,
        userData.bio,
        userData.createdAt
      )
    : protoSymbols.serializeInternalUser(
        PROTO_BUFFER_PTR,
        limit,
        userData.id,
        userData.username,
        userData.email,
        !!userData.isVerified,
        userData.bio,
        userData.refreshToken,
        userData.createdAt
      );

  if (size === 0n) {
    throw new Error("FFI Serialization Failed: Buffer overflow or invalid input.");
  }

  // .subarray() provides a view of the shared buffer. 
  // Warning: If you need to store this long-term while the buffer is reused, 
  // you must .slice() it then. For immediate Redis/Network pipe, subarray is faster.
  return SHARED_PROTO_BUFFER.subarray(0, Number(size));
}