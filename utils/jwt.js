// utils/jwt.js
import bcrypt from "bcrypt"
import { blake3_hash } from "../native/setup.js";
export const jwtMaker = async (fastify, payload) => {
  try {
    // FIX: Check if fastify.jwt exists
    if (!fastify || !fastify.jwt) {
      throw new Error('JWT plugin not registered');
    }
    
    const accessToken = fastify.jwt.sign(payload, { expiresIn: '10m' });
    const refreshToken = fastify.jwt.sign(payload, { expiresIn: '7d' });
const start = process.hrtime.bigint();
const hashToken = blake3_hash(refreshToken);

const end = process.hrtime.bigint();
const durationMs = Number(end - start) / 1_000_000;

fastify.log.info({ 
  durationMs: durationMs.toFixed(3),
  nanoseconds: Number(end - start)
}, 'JWT signing completed');
    return { accessToken, refreshToken, hashToken };
  } catch (error) {
    console.error('JWT Error:', error);
    throw error;
  }
};