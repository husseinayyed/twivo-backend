import mongoose from "mongoose"
const db = mongoose
const likes = new db.Schema({
  twiId: {
    type: String,
    required: true,
    trim: true,
  },
  likedBy: {
    type: String,
    required: true,
    default: 0,
  }
});
export const Like = db.model("likes", likes);
