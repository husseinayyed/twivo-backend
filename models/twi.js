import mongoose from "mongoose"
const db = mongoose
const twis = new db.Schema({
  author:{
    userId:{
      type:mongoose.Schema.Types.ObjectId,
      required:true
    },
    username:{
      type:String,
      required:true
    },
    image:{
      type:String,
      required:false,
      default:null
    }
  },
  content: {
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
