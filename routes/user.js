// routes/user.js - Fastify plugin

import fp from "fastify-plugin";
import { User } from "../models/user.js";
import { Twi } from "../models/twi.js";
import Cache from "../utils/cache.js";
import jwtAuth from "../middleware/jwt.js";
import signEd25519Token from "../utils/edsaTokenMaker.js";
import UserMakerCache from "../Redis/Maker/DB/UserMakerCache.js";
import { ObjectId } from "mongodb";
import { createTwiSchema } from "./schemas/feedSchemas.js";
import TwiQueue from "../queue/Twi/Twi.js";
// Assuming you have a rate limiter for create endpoint
// import createLimiter from '../middleware/rateLimiter.js';

async function userRoutes(fastify, options) {
  // ========== ROUTES ==========

  // Ping
  fastify.get("/ping", async (request, reply) => {
    reply.status(200).send();
  });

  // Follow/unfollow a user
  fastify.post("/follow", async (request, reply) => {
    const { targetUserId } = request.body;
    if (!targetUserId) {
      return reply
        .status(400)
        .send({ e: true, msg: "targetUserId is required" });
    }
    if (targetUserId === request.user.id) {
      return reply
        .status(400)
        .send({ e: true, msg: "You cannot follow yourself" });
    }

    try {
      const result = await Cache.follow.followUser(
        request.user.id,
        targetUserId,
      );
      if (result) {
        return reply
          .status(200)
          .send({ e: false, msg: "Follow status toggled" });
      } else {
        return reply.status(500).send({ e: true, msg: "An error occurred" });
      }
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ e: true, msg: "An error occurred" });
    }
  });

  // Get current user's profile
  fastify.get("/profile", async (request, reply) => {
    const start = Date.now();
    try {
      const userId = request.user.id;

      const userData = await Cache.user.getUser(userId);
      if (!userData) {
        return reply.status(404).send({ error: "User not found" });
      }

      const { username, bio, image, createdAt } = userData;

      const userTwis = await Cache.user.getUserTwis(userId, userId);
      const followStats = await Cache.follow.getFollowStats(userId);

      fastify.log.info(`✅ Profile loaded in ${Date.now() - start}ms`);

      reply.status(200).send({
        data: {
          username,
          bio,
          image,
          createdAt,
          userId,
          myself: true,
        },
        feeds: userTwis,
        followersCount: followStats.followers || 0,
        followingCount: followStats.following || 0,
      });
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: "Failed to load profile" });
    }
  });

  // Get another user's profile by ID
  fastify.get("/:id", async (request, reply) => {
    try {
      const userId = request.params.id;
      const viewerId = request.user.id;

      const userProfile = await Cache.user.getUser(userId);
      if (!userProfile) {
        return reply.status(404).send({ error: "User not found" });
      }

      fastify.log.info(userProfile);

      const userTwis = await Cache.user.getUserTwis(userId, viewerId);
      const followStats = (await Cache.follow.getFollowStats(userId)) || {
        followers: 0,
        following: 0,
      };

      let isFollowing = false;
      let followsYou = false;

      if (viewerId !== userId) {
        isFollowing = await Cache.follow.isFollowing(viewerId, userId);
        followsYou = await Cache.follow.isFollowing(userId, viewerId);
      }

      const response = {
        success: true,
        profile: {
          _id: userProfile._id,
          userId: userProfile._id,
          username: userProfile.username,
          bio: userProfile.bio || "",
          image: userProfile.image || "",
          createdAt: userProfile.createdAt,
          isVerified: userProfile.isVerified || false,
          myself: viewerId === userId,
          isFollowing,
          followsYou,
          followersCount: followStats.followers,
          followingCount: followStats.following,
        },
        twis: userTwis,
      };

      reply.status(200).send(response);
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({
        error: "Failed to load user profile",
        message: error.message,
      });
    }
  });

  // Upload profile image
  // fastify.post('/profile/image', async (request, reply) => {
  //  // disabled temporarily
  // });

  // Create a new tweet (feed item)
  fastify.post(
    "/create",
    {
      preHandler: jwtAuth,
      schema: createTwiSchema,
    },
    async (request, reply) => {
      try {
        // check if the user wants to provide an image
        const twiId = new ObjectId();
        if (!request.body.attachment) {
          const response = await TwiQueue.addTwiToQueue(request.body.text,request.user.id,false,null,null,twiId);
          return reply.status(200).send({
            msg:"Done"
          }); 
        } else {
          const [req, token] = await Promise.all([
            Cache.user.addTwiToPendingList(twiId, request.body.text),
            signEd25519Token(request.user.id, "uploadImage", 5, twiId),
          ]).catch((error) => {
            throw new Error(error);
          });
          return token;
        }
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          e: true,
          msg: error.message || "Failed to create feed",
        });
      }
    },
  );
}

export default userRoutes;
