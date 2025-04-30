import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/.+\@.+\..+/, 'Please fill a valid email address'],
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
    enum: ["admin", "hirer", "user"],
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
    type: String,
    default: null,
  },
  isProfileComplete: {
    type: Boolean,
    default: false,
  },
  googleTokens: {
    type: Object,
  },
  businessDetails: {
    type: {
      companyName: { type: String },
      industry: { type: String },
      description: { type: String },
      website: { type: String },
    },
    default: null,
  },
  pastWork: {
    type: [{
      title: { type: String },
      description: { type: String },
      duration: { type: String },
    }],
  },
  ratings: [{
    ratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    comment: {
      type: String,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  }],
  resetPasswordToken: {
    type: String,
  },
  resetPasswordExpires: {
    type: Date,
  },
}, { timestamps: true });

export default mongoose.model('User', userSchema);