import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import cors from "@fastify/cors";
import mongoose from "mongoose";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt"
import auth from "./routes/auth.js";
import api from "./routes/api.js";
import startReading from "./consumer/stream.js";
import setup from "./consumer/setup.js";
import feed from "./routes/feed.js";
import user from "./routes/user.js";
import { Initialize } from "./utils/edsaTokenMaker.js";
import { connectDB, getDbStatus } from "./utils/db.js";
import feedRoutes from "./routes/feed.js";

export const fastify = Fastify({
  logger: true,
  trustProxy: 1
});

// Connect to MongoDB with better error handling
try {
    await connectDB();
    console.log(`DB Status: ${getDbStatus()}`);
} catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
}

// Register plugins
await fastify.register(helmet);
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL,
  credentials: true,
});
await fastify.register(cookie, {
  secret: process.env.COOKIE_SECRET,
  hook: 'onRequest',
});
await fastify.register(jwt, {
  secret: process.env.JWT_SECRET,
});

// Start the consumer
await setup("uploads:stream", "backend");
startReading().catch(error => {
  console.error("❌ Consumer crashed:", error);
});

Initialize();

// Register routes
fastify.register(api, { prefix: '/api' });
fastify.register(auth, { prefix: '/api/auth' });
fastify.register(user, { prefix: '/api/user' });
fastify.register(feedRoutes, { prefix: '/api/feed' });

// Health check route
fastify.get('/health', async () => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongodb: dbStatus[dbState]
  };
});

const PORT = process.env.PORT || 3000;

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('Server running on port 3000');
  } catch (err) {
    console.error(err);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  }
};

// Only start if not in test environment
if (process.env.NODE_ENV !== 'test') {
  start();
}
export default start;