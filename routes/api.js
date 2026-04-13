import jwtAuth from "../middleware/jwt.js";
import Cache from "../utils/cache.js";

export default async (fastify, options) => {
  fastify.get("/ping", async (request, reply) => {
    // This will only run if jwtAuth passes
    // You can access the authenticated user

    return {
      message: "pong",
    };
  });
  fastify.get("/check", { preHandler: jwtAuth }, async (request, reply) => {
    // This will only run if jwtAuth passes
    // You can access the authenticated user
    console.log("Authenticated user:", request.user);
    const feed = await Cache.twi.get.getFeed(request.user.id);
           
    return {
      message: feed,
      user: request.user, // Optional: return user info
    };
  });
};
