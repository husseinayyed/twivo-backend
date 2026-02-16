// routes/auth.js - Fastify Version
import { User } from "../models/user.js";
import { jwtMaker } from "../utils/jwt.js";
import bcrypt from "bcrypt";
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
  max: 6000,
  timeWindow: "1 minute",
  keyGenerator: (request) => request.ip,
};

export default async function (fastify, options) {
  fastify.post(
    "/sign",
    {
      schema: signupSchema,
      config: { rateLimit: rateLimitConfig },
    },
    async (request, reply) => {
      try {
        const { username, email, name } = request.body;
        const existingUser = await User.findOne({ username });

        if (existingUser) {
          return reply.status(409).send({ msg: "user already exists!" });
        }
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          return reply.status(409).send({ msg: "Email already registered!" });
        }
        const magicUrl = uuid4();
        await Cache.client.set(
          `magicUrl:${magicUrl}`,
          `${email}:${username}:${name}`,
          "EX",
          900,
        );
        fastify.log.info(`${email}:  ${magicUrl}`);
        return reply.status(201).send({
          success: true,
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

        const data = await Cache.client.get(key);
        if (!data) {
          return reply.status(400).send({
            success: false,
            msg: "Magic URL expired",
          });
        }

        const [email, username, name] = data.split(":");

        // Check if user already exists by email
        let user = await User.findOne({ email });

        if (user) {
          // User exists - update their refresh token and log them in
          const payload = { id: user._id, username: user.username };
          const { accessToken, refreshToken, hashToken } = await jwtMaker(
            fastify,
            payload,
          );

          // Update user's refresh token
          user.refreshToken = hashToken;
          await user.save();

          // Set cookies
          reply.setCookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 10 * 60 * 1000, // 10 minutes
            path: "/",
          });

          reply.setCookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: "/",
          });
        } else {
          // Check if username is taken by another email
          const existingUsername = await User.findOne({ username });
          if (existingUsername) {
            return reply.status(400).send({
              success: false,
              msg: "Username already taken. Please sign up again with a different username.",
            });
          }

          // Create new user since none exists with this email
          const newUser = await User.create({
            email,
            username,
            name,
            isVerified: false,
          });

          const payload = { id: newUser._id, username: newUser.username };
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
            maxAge: 10 * 60 * 1000, // 10 minutes
            path: "/",
          });

          reply.setCookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: "/",
          });
        }
        await Cache.user.cacheUserData(user);
        await Cache.client.del(key);
        return reply.status(user == null ? 201 : 200).send({
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
