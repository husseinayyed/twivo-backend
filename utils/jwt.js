// utils/jwt.js

import { blake3_hash } from "../native/setup.js";
export const jwtMaker = async (fastify, payload) => {
  try {
    // FIX: Check if fastify.jwt exists
    if (!fastify || !fastify.jwt) {
      throw new Error("JWT plugin not registered");
    }

    const accessToken = fastify.jwt.sign(payload, { expiresIn: "10m" });
    const refreshToken = fastify.jwt.sign(payload, { expiresIn: "14d" });

    const hashToken = blake3_hash(refreshToken);

    return { accessToken, refreshToken, hashToken };
  } catch (error) {
    console.error("JWT Error:", error);
    throw error;
  }
};
