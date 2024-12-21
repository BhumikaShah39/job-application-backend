import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName:{
    type: String,
    required: true,
  },
  lastName:{
    type: String,
    required: true,
  },
  email:{
    type: String,
    required: true,
    unique: true,
    match: [/.+\@.+\..+/, 'Please fill a valid email address'],
  },
  password:{
    type: String,
    required: true,
  },
  role:{
    type: String,
    required: true,
    enum: ["admin","hirer","user"],
  }


},
{
  timestamps: true,
});

export default mongoose.model('User', userSchema);

