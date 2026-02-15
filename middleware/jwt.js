// middleware/jwt.js - Fastify version with auto refresh
import { jwtMaker } from "../utils/jwt.js";
import { User } from "../models/user.js";
import bcrypt from "bcrypt";

const jwtAuth = async (request, reply) => {
  try {
    // Get tokens from cookies
    const accessToken = request.cookies.accessToken;
    const refreshToken = request.cookies.refreshToken;

    // First try access token using fastify.jwt.verify()
    if (accessToken) {
      try {
        const decoded = await reply.server.jwt.verify(accessToken);
        request.user = decoded;
        return;
      } catch (err) {
        // Access token invalid, continue to refresh token flow
      }
    }

    // Access token invalid or missing, try refresh token
    if (!refreshToken) {
      return reply.status(401).send({ 
        error: true, 
        msg: "Access token is missing or invalid." 
      });
    }

    // Verify refresh token using fastify.jwt.verify()
    let refreshDecoded;
    try {
      refreshDecoded = await reply.server.jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    } catch (err) {
      return reply.status(401).send({ 
        error: true, 
        msg: "Session expired. Please login again." 
      });
    }

    // Get user and check if refresh token matches
    const user = await User.findById(refreshDecoded.id);
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

    // Generate new access token
    const payload = { id: user._id, username: user.username };
    const { accessToken: newAccessToken } = await jwtMaker(payload);

    // Set new access token cookie
    reply.setCookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/'
    });

    // Attach user to request
    request.user = { id: user._id, username: user.username };

  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ 
      error: true, 
      msg: "Authentication error: " + error.message 
    });
  }
};

export default jwtAuth;