import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import joi from "joi";
import passwordComplexity from "joi-password-complexity";

const candidateSchema = new mongoose.Schema({
  firstName:{
    type: String,
    required: true,
  },
  LastName:{
    type: String,
    required: true,
  },
  email:{
    type: String,
    required: true,
  },
  password:{
    type: String,
    required: true,
  },


});

candidateSchema.methods.generateAuthToken = function (){
  const token = jwt.sign({_id:this_id},process.env.JWTPRIVATEKEY,{expirein:"7d"})
  return token
};

const candidate = mongoose.model('Candidate',candidateSchema);
const validate = (data) => {
  const schema = Joi.object({
    firstName:Joi.string().required().label("First Name"),
    lastName:Joi.string().required().label("Last Name"),
    email:Joi.string().email().required().label("Email"),
    password:passwordComplexity().required().label("Password")
  });
  return schema.validate(data)
};

module.exports = {candidate,validate};

