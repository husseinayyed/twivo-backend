import { dlopen, ptr, FFIType } from "bun:ffi";
import {join} from "node:path"
const LIB_PATH = join(import.meta.dir, "./build/libblake3_hash.so");
const { symbols } = dlopen(LIB_PATH, {
  blake3_hash: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr],
    returns: FFIType.void,
  },
});
const encoder = new TextEncoder();
const resultBuffer = new Uint8Array(32);
const resultPtr = ptr(resultBuffer);


export function blake3_hash(data) {
  const buf = typeof data === "string" ? encoder.encode(data) : data;

  symbols.blake3_hash(
    ptr(buf),
    BigInt(buf.byteLength),
    resultPtr
  );

  return Buffer.from(resultBuffer).toString("base64");
}