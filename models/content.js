import mongoose from "mongoose"
const db = mongoose
const contents = new db.Schema({
  twiId: {
    type: String,
    required: true,
    trim: true,
  },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    attachment: {
      type: Boolean,
      required: true,
      default: false,
    },
  image: {
    type: String,
    required: false,
    trim: true,
  },
  aspectClass: {
    type: String,
    required: false,
    trim: true,
  },
  deleteUrl: {
    type: String,
    required: false,
    trim: true,
  },
},
  {
    timestamps:true
  });
export const Content = db.model("contents", contents);