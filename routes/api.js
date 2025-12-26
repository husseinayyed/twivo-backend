import express from "express";
const api = express.Router()
api.get("/ping",(req,res)=>{
   return res.status(200).json({success:true})
})
export default api