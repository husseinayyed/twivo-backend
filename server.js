import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import cors from "@fastify/cors";
import mongoose from "mongoose";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import auth from "./routes/auth.js";
import api from "./routes/api.js";
import startReading from "./consumer/stream.js";
import setup from "./consumer/setup.js";
import feedRoutes from "./routes/feed.js";
import user from "./routes/user.js";
import { Initialize } from "./utils/edsaTokenMaker.js";
import { connectDB } from "./utils/db.js";

export const fastify = Fastify({
  logger: true,
  trustProxy: true // Necessary for Docker/Proxy environments
});

// 1. MUST Register CORS first with credentials allowed
await fastify.register(cors, {
  origin: (origin, cb) => {
    // In production, replace with your actual domain
    cb(null, true); 
  },
  credentials: true,
});

// 2. MUST Register Cookies with a secret and hook
await fastify.register(cookie, {
  secret: process.env.COOKIE_SECRET || "google-scale-secret-key",
  hook: 'onRequest', // Critical: ensures cookies are parsed before middleware
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET,
});

await fastify.register(helmet);

// Initialize DB and Services
await connectDB();
Initialize();
await setup("uploads:stream", "backend");
startReading().catch(err => console.error("Consumer error:", err));

// Register routes
fastify.register(api, { prefix: '/api' });
fastify.register(auth, { prefix: '/api/auth' });
fastify.register(user, { prefix: '/api/user' });
fastify.register(feedRoutes, { prefix: '/api/feed' });

// Global Error Handler
fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  
  // Custom error response
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    error: true,
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal Server Error'
      : error.message,
    code: error.code
  });
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') start();