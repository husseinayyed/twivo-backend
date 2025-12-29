import express from "express";
import { User } from "../models/user.js";
import { isTokenValid, jwtMaker } from "../utils/jwt.js";
import passport from "../config/passport.js";
import jwtAuth from "../middleware/jwt.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { rateLimit } from "express-rate-limit";
import Cache from "../utils/cache.js";
const auth = express.Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5000,
});
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 6000,
});
auth.use(passport.initialize());
auth.post("/sign", limiter, async (req, res) => {
  let userUsername;
  try {
    const { username, password, checked } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = await User.findOne({ username });
    if (user) return res.status(409).json({ msg: "user already exists!" });
    else {
      
      const user = await User.create({
        username,
        password: hash,
      });
      const payload = {
        id: user._id,
        username,
      };
      const { accessToken, refreshToken, hashToken, recoveryKeys } =
      await jwtMaker(payload);
      user.refreshToken = hashToken;
      user.recoveryKeys = recoveryKeys;
      await user.save();
      userUsername = user.username
      let age;
      if (checked) age = 7 * 24 * 60 * 60 * 1000;
      else age = 1 * 24 * 60 * 60 * 1000;
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 10 * 60 * 1000,
        path: '/',
      });
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: age,
        path: '/api/auth/test',
      });
      return res.status(201).json({
        success:true,
        msg: "Your account has just made successfully",
        accessToken,
        username:userUsername,
        recoveryKeys,
      });
    }
  } catch (e) {
    console.log(e);
    return res.status(500).json({ msg: "Server Error 500" });
  }
});
auth.post("/login", limiter, (req, res, next) => {
  passport.authenticate(
    "local",
    { session: false },
    async (err, user, info) => {
      if (err) {
        return res.status(500).json({
          success: false,
          msg: "Server error during authentication",
        });
      }
      let userUsername;
      if (!user) {
        // Authentication failed - send JSON response with custom message
        return res.status(401).json({
          success: false,
          msg: info?.msg || info?.message || "Authentication failed",
        });
      }
      const { checked } = req.body;
      const payload = {
        id: user._id,
        username: user.username,
      };
      userUsername = user.username
      const { accessToken, refreshToken, hashToken } = await jwtMaker(payload);
      user.refreshToken = hashToken;
      await user.save();
      let age;
      if (checked) age = 7 * 24 * 60 * 60 * 1000;
      else age = 1 * 24 * 60 * 60 * 1000;
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 10 * 60 * 1000,
        path: '/',
      });
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: age,
       path: '/api/auth/test',
      });
      // Authentication succeeded
       res.status(200).json({
        success: true,
        msg: "Login successful",
        username:userUsername
      });
    }
  )(req, res, next);
});
auth.get("/protected", authLimiter,jwtAuth,async (req, res) => {
  const user = await Cache.user.getUser(req.user.id)
  if(!user) return res.status(400).json({e:true})
  const {username,image} = user
  return res.status(200).json({ success: true,username,image });
});
auth.get("/test", authLimiter,async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  let userUsername;
  if (!refreshToken) {
    return res
      .status(401)
      .json({ msg: "Access denied. No refresh token provided.", error: true });
  }

    const refreshResult = isTokenValid(
      refreshToken,
      process.env.REFRESH_SECRET
    );
    if (!refreshResult[0]) {
     return res
        .status(401)
        .json({ msg: "Invalid refresh token.", error: true });
    }

    const token = refreshResult[1];
    const user = await Cache.user.getUser(token.id);
    if (!user) {
     return res.status(401).json({ msg: "User not found.", error: true });
    }
    userUsername = user.username;
    const isUserToken = await bcrypt.compare(refreshToken, user.refreshToken);

    if (!isUserToken) {
     return res
        .status(401)
        .json({ msg: "Refresh token mismatch.", error: true });
    }
    const payload = {
        id: user._id,
        username: userUsername
      };
    const {accessToken} = await jwtMaker(payload)
    res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 10 * 60 * 1000,
        path: '/'
      });
   return res.status(200).json({error:false,username:userUsername,msg:"Access Token created!"})
  

  });
auth.delete("/logout", (req, res) => {
  res.status(200).clearCookie("refreshToken").clearCookie("accessToken").json({ success: true });
});
export default auth;
