export default async (fastify,options) => {
   fastify.get('/ping',_ => {
      return "pong";
   })
}