import mongoose from "mongoose"
import bcrypt from "bcrypt"
const db = mongoose
const sign = new db.Schema({
  name: {
    type: String,
    required: false,
    default:"Twivo's user",
    trim: true,
  },
  username: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  isVerified: {
    type:Boolean,
    required:false,
    default:false
  },
  image:{
    type: String,
    default: null
  },
  bio:{
    type: String,
    default: null
  },
  refreshToken: {
    type: String,
    required: false
  }},
  {
    timestamps:true
  });
export const User = db.model("users", sign);
