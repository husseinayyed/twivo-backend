import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import auth from "./routes/auth.js";
import api from "./routes/api.js";
import feed from "./routes/feed.js";
import user from "./routes/user.js";
import helmet from "helmet"
dotenv.config();
const app = express();
const db = mongoose;

db.connect(process.env.DB_URL).then(() => {
  console.log("Mongodb atlas database is running");
});
app.set('trust proxy', 1); 
app.use(helmet())
// ✅ CORRECT ORDER:
// 1. CORS first (to allow cookie headers)
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true, // This allows cookies to be sent
  })
);

// 2. cookieParser second (to parse incoming cookies)
app.use(cookieParser());

// 3. Body parser third
app.use(express.json());


// Your routes
app.use("/api", api);
app.use("/api/auth", auth);
app.use("/api/feed", feed);
app.use("/api/user", user);

const PORT = process.env.PORT;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});