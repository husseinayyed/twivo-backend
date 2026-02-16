import jwtAuth from "../middleware/jwt.js";

export default async (fastify, options) => {
   fastify.get('/ping', { preHandler: jwtAuth }, async (request, reply) => {
      // This will only run if jwtAuth passes
      // You can access the authenticated user
      console.log('Authenticated user:', request.user);
      
      return { 
         message: "pong",
         user: request.user // Optional: return user info
      };
   });
};