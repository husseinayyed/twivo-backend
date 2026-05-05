import mongoose from "mongoose"
const db = mongoose
const sign = new db.Schema({
  name: {
    type: String,
    required: true,
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
    required:true
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
    required: true,
  }},
  {
    timestamps:true
  });
export const User = db.model("users", sign);
