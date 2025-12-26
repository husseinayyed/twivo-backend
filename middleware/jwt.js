import passport from "../config/passport.js"

const jwtAuth = async (req, res, next) => {
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
        if (err) {
            console.error("❌ JWT Auth error:", err)
            return res.status(500).json({ 
                error: true, 
                msg: "Authentication error: " + err.message 
            })
        }
        
        if (!user) {
            return res.status(401).json({ 
                error: true, 
                msg: info?.message || "Access token is missing or invalid." 
            })
        }
        
        // Attach user to request
        req.user = user
        
        // Set new access token if generated
        if (req._newAccessToken) {
            res.cookie('accessToken', req._newAccessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 15 * 60 * 1000, // 15 minutes
                path: '/'
            })
        }
        
        next()
    })(req, res, next)
}

export default jwtAuth