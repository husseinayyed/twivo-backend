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
import { addTwiToQueue } from "../queue/Twi/Twi.js";
import SchemaCache from "../Redis/schemas.js";
import { followSchema } from "./schemas/userSchema.js";
// Assuming you have a rate limiter for create endpoint
// import createLimiter from '../middleware/rateLimiter.js';

async function userRoutes(fastify, options) {
  // ========== ROUTES ==========

  // Follow/unfollow a user
  fastify.post(
    "/follow",
    { preHandler: jwtAuth, schema: followSchema },
    async (request, reply) => {
      const { targetUserId } = request.body;

      if (targetUserId === request.user.id) {
        return reply
          .status(400)
          .send({ e: true, msg: "You cannot follow yourself" });
      }

      try {
        const result = await Cache.follow.set.followUser(
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
    },
  );

  // Get current user's profile
  fastify.get("/profile", { preHandler: jwtAuth }, async (request, reply) => {
    const start = Date.now();
    try {
      const userId = request.user.id;

      const userData = await Cache.user.get.getUser(userId,true);
      if (!userData) {
        return reply.status(404).send({ error: "User not found" });
      }

      fastify.log.info(`✅ Profile loaded in ${Date.now() - start}ms`);

      return reply
            .type("application/x-protobuf")
            .status(200)
            .send(Buffer.from(binaryData));
    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: "Failed to load profile" });
    }
  });

  // Get another user's profile by ID
 fastify.get(
    "/:id",
    {
      preHandler: jwtAuth,
    },
    async (request, reply) => {
      try {
        const userId = request.params.id;
        const viewerId = request.user.id;

        const result = await Cache.user.get.getUserProfileWithStats(userId, viewerId);
        
        if (!result) {
          return reply.status(404).send({ error: "User not found" });
        }

        reply.status(200).send({
          success: true,
          ...result,
        });
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          error: "Failed to load user profile",
          message: error.message,
        });
      }
    },
);

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
          const response = await addTwiToQueue(
            request.body.text,
            request.user.id,
            false,
            null,
            null,
            twiId.toString(),
          );

          return reply.status(202).send({
            msg: "Done",
          });
        } else {
          const [req, token] = await Promise.all([
            Cache.user.set.addTwiToPendingList(twiId, request.body.text),
            signEd25519Token(
              request.user.id,
              "uploadImage",
              5,
              twiId.toString(),
            ),
          ]).catch((error) => {
            throw new Error(error);
          });
          return reply.status(202).send({ token: token });
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
