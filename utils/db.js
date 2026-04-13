import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get the correct path to .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });
let isConnected = false;

export const connectDB = async () => {
    if (!process.env.DB_URL) {
        console.error("❌ DB_URL is not defined in environment variables");
        throw new Error("DB_URL not defined");
    }
    
    if (isConnected && mongoose.connection.readyState === 1) {
        return true;
    }
    try {
        await mongoose.connect(process.env.DB_URL, {
            connectTimeoutMS: 30000,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
        });
        
        isConnected = true;
        console.log("✅ MongoDB connected");
        return true;
    } catch (error) {
        console.error("❌ MongoDB connection failed:", error.message);
        isConnected = false;
        throw error;
    }
};

export const getDbStatus = () => {
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    return states[mongoose.connection.readyState] || 'unknown';
};