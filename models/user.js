import mongoose from "mongoose"
import bcrypt from "bcrypt"
const db = mongoose
const sign = new db.Schema({
  username: {
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
  password: {
    type: String,
    required: true,
  },
  recoveryKeys:{
    type:[String],
    default: []
  },
  image:{
    type: String,
    default: null
  },
  deleteUrl:{
    type: String,
    required: false
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
