// routes/auth.js - Fastify Version
import { User } from "../models/user.js";
import { jwtMaker } from "../utils/jwt.js";
import Cache from "../utils/cache.js";
import {
  signupSchema,
  logoutSchema,
  loginSchema,
} from "./schemas/authSchemas.js";
import jwtAuth from "../middleware/jwt.js";
import uuid4 from "uuid4";
const rateLimitConfig = {
  max: 5,
  timeWindow: "15 minutes",
  keyGenerator: (request) => request.ip,
};

const authRateLimitConfig = {
  max: 5,
  timeWindow: "15 minute",
  keyGenerator: (request) => request.ip,
};

export default async function (fastify, options) {
  fastify.post(
    "/sign",
    {
      schema: signupSchema,
      config: { rateLimit: authRateLimitConfig },
    },
    async (request, reply) => {
      try {
        const { username, email, name } = request.body;
        
        // Use Redis SETNX to prevent duplicate pending signups
        const emailKey = `pending:email:${email}`;
        const usernameKey = `pending:username:${username}`;
        
        // Try to set both keys atomically
        const [emailSet, usernameSet] = await Promise.all([
          Cache.client.setnx(emailKey, "1"),
          Cache.client.setnx(usernameKey, "1"),
        ]);
        
        // If either key already exists, return conflict
        if (!emailSet || !usernameSet) {
          // Clean up any partial keys
          if (!emailSet) {
            fastify.log.info(`Duplicate pending email: ${email}`);
          }
          if (!usernameSet) {
            fastify.log.info(`Duplicate pending username: ${username}`);
          }
          return reply.status(409).send({ 
            msg: "Email or username already has a pending signup. Please check your email or try again later." 
          });
        }
        
        // Set expiration for the pending keys (10 minutes)
        await Promise.all([
          Cache.client.expire(emailKey, 900),
          Cache.client.expire(usernameKey, 900),
        ]);
        
        const magicUrl = uuid4();
        const key = `magicUrl:${magicUrl}`;

        await Cache.client
          .pipeline()
          .hset(key, {
            email: email,
            username: username,
            name: name,
          })
          .expire(key, 900)
          .exec();
          
        fastify.log.info(`${email}: ${magicUrl}`);
        return reply.status(202).send({
          magicUrl: magicUrl,
        });
      } catch (e) {
        fastify.log.error(e);
        return reply.status(500).send({ msg: "Server Error 500" });
      }
    },
);
 fastify.post(
    "/login",
    {
      schema: loginSchema,
      config: { rateLimit: rateLimitConfig },
    },
    async (request, reply) => {
      try {
        const { magicUrl } = request.body;
        const key = `magicUrl:${magicUrl}`;
        const exists = await Cache.client.exists(key);

        if (!exists) {
          return reply.status(400).send({
            success: false,
            msg: "Invalid or expired magic URL",
          });
        }
        
        const data = await Cache.client.hgetall(key);

        if (!data || Object.keys(data).length === 0) {
          return reply.status(400).send({
            success: false,
            msg: "Magic URL expired or invalid",
          });
        }

        const { email, username, name } = data;
        
        // Clean up pending keys
        const emailKey = `pending:email:${email}`;
        const usernameKey = `pending:username:${username}`;
        
        await Promise.all([
          Cache.client.del(emailKey),
          Cache.client.del(usernameKey),
        ]);
        
        // Check if user already exists by email
        let user = await Cache.user.get.getUserByMethod("email", email);
        
        if (user) {
          // User exists - update their refresh token
          const payload = { id: user._id.toString(), username: user.username };
          const { accessToken, refreshToken, hashToken } = await jwtMaker(
            fastify,
            payload,
          );
          
          const userDB = await User.findOne({ email: email });
          userDB.refreshToken = hashToken;
          await userDB.save();

          // Set cookies
          reply.setCookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 10 * 60 * 1000,
            path: "/",
          });

          reply.setCookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/",
          });
          
          await Cache.user.set.cacheUserData(userDB);
        } else {
          // Check if username is taken by another email
          const existingUsername = await Cache.user.get.getUserByMethod(
            "username",
            username,
          );
          
          if (existingUsername) {
            return reply.status(400).send({
              success: false,
              msg: "Username already taken. Please sign up again with a different username.",
            });
          }
          
          // Create new user
          const newUser = await User.create({
            email,
            username,
            name,
            isVerified: false,
          });

          const payload = {
            id: newUser._id.toString(),
            username: newUser.username,
          };
          
          const { accessToken, refreshToken, hashToken } = await jwtMaker(
            fastify,
            payload,
          );

          newUser.refreshToken = hashToken;
          await newUser.save();

          // Set cookies
          reply.setCookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 10 * 60 * 1000,
            path: "/",
          });

          reply.setCookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/",
          });
          
          await Cache.user.set.cacheUserData(newUser);
        }
        
        await Cache.client.del(key);
        return reply.status(200).send({
          success: true,
        });
      } catch (e) {
        fastify.log.error(e);
        return reply.status(500).send({
          success: false,
          msg: "Server Error 500",
        });
      }
    },
);
  fastify.delete(
    "/logout",
    {
      schema: logoutSchema,
    },
    async (request, reply) => {
      reply
        .clearCookie("refreshToken", { path: "/api/auth/refresh" })
        .clearCookie("accessToken", { path: "/" })
        .status(200)
        .send({ success: true });
    },
  );
}
