import mongoose from "mongoose"
const db = mongoose
const twis = new db.Schema({
  madeBy:{
      type:String,
      required:true
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
    default:null,
    trim: true,
  },
  aspectClass: {
    type: String,
    required: false,
    default:null,
    trim: true,
  },
  likes: {
    type: Number,
    required: true,
    default: 0,
  },
  comments: {
    type: Number,
    required: true,
    default: 0
  },
},
  {
    timestamps:true
  });
export const Twi = db.model("twis", twis);
