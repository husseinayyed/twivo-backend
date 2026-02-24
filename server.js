import Fastify from "fastify";
import cors from "@fastify/cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt"
import auth from "./routes/auth.js";
import api from "./routes/api.js";
dotenv.config();

const fastify = Fastify({
  logger: true,
  trustProxy: 1
});

const db = mongoose;

// Connect to MongoDB

  await db.connect(process.env.DB_URL);
  console.log("Mongodb atlas database is running");
  await fastify.register(helmet, {
    // Helmet options if needed
  });
  
  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });
  
  await fastify.register(cookie, {
    secret: process.env.COOKIE_SECRET, // Add a secret for cookie signing
    hook: 'onRequest', // Parse cookies on request
  });
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET, // Default secret
  })
// Register plugins

// Register routes
fastify.register(api, { prefix: '/api' });
fastify.register(auth, { prefix: '/api/auth' });

// Health check route
fastify.get('/health', _ => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const PORT = process.env.PORT || 3000;

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log("Server running on port", PORT);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();