// routes/auth.js - Fastify Version
import { User } from "../models/user.js";
import { jwtMaker } from "../utils/jwt.js";
import bcrypt from "bcrypt";
import Cache from "../utils/cache.js";
import { 
  signupSchema, 
  logoutSchema 
} from "./schemas/authSchemas.js";
import jwtAuth from "../middleware/jwt.js";

const rateLimitConfig = {
  max: 5,
  timeWindow: '15 minutes',
  keyGenerator: (request) => request.ip,
};

const authRateLimitConfig = {
  max: 6000,
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip
};

export default async function (fastify, options) {
  fastify.post('/sign', {
    schema: signupSchema,
    config: { rateLimit: rateLimitConfig }
  }, async (request, reply) => {
    try {
      const { username, email } = request.body;
      const existingUser = await User.findOne({ username });
    
      if (existingUser) {
        return reply.status(409).send({ msg: "user already exists!" });
      }
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return reply.status(409).send({ msg: "Email already registered!" });
    }
      const user = await User.create({
        username,
        email,
        isVerified:false
      });

      const payload = { id: user._id, username };
      const { accessToken, refreshToken, hashToken } = await jwtMaker(fastify,payload);
      
      user.refreshToken = hashToken;
      await user.save();
      reply
      .setCookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 10 * 60 * 1000,
        path: '/',
        signed:true
      });

      reply.setCookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge:  7 * 24 * 60 * 60 * 1000,
        signed:true
      });

      return reply.status(201).send({
        success: true,
      });

    } catch (e) {
      fastify.log.error(e);
      return reply.status(500).send({ msg: "Server Error 500" });
    }
  });



  fastify.delete('/logout', {
    schema: logoutSchema
  }, async (request, reply) => {
    reply
      .clearCookie("refreshToken", { path: '/api/auth/refresh' })
      .clearCookie("accessToken", { path: '/' })
      .status(200)
      .send({ success: true });
  });
}