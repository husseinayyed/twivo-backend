import mongoose from "mongoose"
const db = mongoose;
const follows = new db.Schema({
  following: {
    type: String,
    required: true,
    trim: true,
  },
  follower: {
    type: String,
    required: true,
    default: 0,
  }
});
export const Follow = db.model("follows", follows);
