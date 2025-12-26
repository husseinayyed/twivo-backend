import passport from "passport"
import { Strategy as LocalStrategy } from "passport-local"
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt"
import jwt from "jsonwebtoken"
import { User } from "../models/user.js"
import bcrypt from "bcrypt"
import { isTokenValid } from "../utils/jwt.js"
import Cache from "../utils/cache.js"
import dotenv from "dotenv"
dotenv.config()
// 1. Local Strategy
passport.use(new LocalStrategy({usernameField:'username'}, async (username, password, done) => {
    try {
        const user = await User.findOne({username})
        if(!user) return done(null, false, {msg: "User not found"})
        const isMatch = await bcrypt.compare(password, user.password)
        if(!isMatch) return done(null, false, {msg: "Password is incorrect"})
        return done(null, user)
    } catch (error) {
        return done(error, false)
    }
}))

// 2. JWT Strategy
const cookieExtractor = (req) => {
    let token = null
    if (req && req.cookies) {
        token = req.cookies.accessToken
    }
    return token
}

const jwtOptions = {
    jwtFromRequest: cookieExtractor,
    secretOrKey: process.env.JWT_SECRET,
    passReqToCallback: true
}

passport.use('jwt', new JwtStrategy(jwtOptions, async (req, jwtPayload, done) => {
    try {
        console.log("🔒 Passport JWT verify callback invoked")
        
        const token = cookieExtractor(req)
        if (!token) {
            return done(null, false, { message: "Access token is missing." })
        }
        
        // Check if token is valid
        const tokenValid = isTokenValid(token, process.env.JWT_SECRET)
        
        if (!tokenValid[0]) {
            return done(null, false, { message: "Invalid access token." })
        }
        
        // Get user from cache
        const userFetch = await Cache.user.getUser(tokenValid[1].id)
        if (!userFetch) {  
            return done(null, false, { message: "User not found." })
        }
        
        // Generate new access token
        const newAccessToken = jwt.sign(
            { id: userFetch._id, username: userFetch.username },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        )
        
        // Attach to request
        req._newAccessToken = newAccessToken
        
        return done(null, {
            id: userFetch._id,
            username: userFetch.username,
            image:userFetch.image
        })
        
    } catch (error) {
        console.error("❌ Passport JWT verify error:", error)
        return done(error, false)
    }
}))

export default passport