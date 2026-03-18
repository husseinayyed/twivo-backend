// middleware/jwt.js
import { jwtMaker } from "../utils/jwt.js";
import bcrypt from "bcrypt";
import Cache from "../utils/cache.js";
const jwtAuth = async (request, reply) => {
  try {
    // Get tokens from cookies
    const accessToken = request.cookies.accessToken;
    const refreshToken = request.cookies.refreshToken;

    // First try access token
    if (accessToken) {
      try {
        const decoded = await reply.server.jwt.verify(accessToken);
        request.user = decoded;
        return;
      } catch (err) {
        // Access token invalid, continue
      }
    }

    // Try refresh token
    if (!refreshToken) {
      return reply.status(401).send({ 
        error: true, 
        msg: "Access token is missing or invalid." 
      });
    }

    // Verify refresh token
    let refreshDecoded;
    try {
      refreshDecoded = await reply.server.jwt.verify(refreshToken);
    } catch (err) {
      return reply.status(401).send({ 
        error: true, 
        msg: "Session expired. Please login again." 
      });
    }

    // Get user
    const user = await Cache.user.getUser(refreshDecoded.id);
    if (!user) {
      return reply.status(401).send({ 
        error: true, 
        msg: "User not found." 
      });
    }

    // Verify refresh token matches stored hash
    const isTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isTokenValid) {
      return reply.status(401).send({ 
        error: true, 
        msg: "Invalid refresh token." 
      });
    }

    // FIX: Pass the fastify instance (reply.server) to jwtMaker
    const payload = { id: user._id.toString(), username: user.username };
    const { accessToken: newAccessToken } = await jwtMaker(reply.server, payload); // FIXED: passing reply.server

    // Set new access token cookie
    reply.setCookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/',
    });

    request.user = payload;

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ 
      error: true, 
      msg: "Authentication error: " + error.message 
    });
  }
};

export default jwtAuth;