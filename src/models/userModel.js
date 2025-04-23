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
  },
  
  interests: {
    type: [String],
  },
  education: {
    type: [String],
  },
  skills: {
    type: [String],
  },
  linkedin: {
    type: String,
  },
  github: {
    type: String,
  },
  experience: {
    type: [String],
  },
  profilePicture: {
      type: String, // Path to the uploaded image file
      default: null,
    },

  isProfileComplete: {
    type: Boolean,
    default: false, // Default to false for new users
  },
  googleTokens: { type: Object },



},
{
  timestamps: true,
});

export default mongoose.model('User', userSchema);

