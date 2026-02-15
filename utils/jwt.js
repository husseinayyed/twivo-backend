import bcrypt from "bcrypt"

async function jwtMaker(fastify,payload) {
 const accessToken = await fastify.jwt.sign(payload, {
    expiresIn: "10m",
    secret: process.env.JWT_SECRET
  });
  
  const refreshToken = await fastify.jwt.sign(payload, {
    expiresIn: "7d",
    secret: process.env.REFRESH_SECRET
  });
  const hashToken = await bcrypt.hash(refreshToken, 10);
  return { accessToken, refreshToken, hashToken }
}
export {jwtMaker}