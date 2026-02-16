// utils/jwt.js
import bcrypt from "bcrypt"
export const jwtMaker = async (fastify, payload) => {
  try {
    // FIX: Check if fastify.jwt exists
    if (!fastify || !fastify.jwt) {
      throw new Error('JWT plugin not registered');
    }
    
    const accessToken = fastify.jwt.sign(payload, { 
      expiresIn: '10m' 
    });
    
    const refreshToken = fastify.jwt.sign(payload, { 
      expiresIn: '7d' 
    });
    
    // Hash refresh token for storage
    const hashToken = await bcrypt.hash(refreshToken, 10);
    
    return { accessToken, refreshToken, hashToken };
  } catch (error) {
    console.error('JWT Error:', error);
    throw error;
  }
};