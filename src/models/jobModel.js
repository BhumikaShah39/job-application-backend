// job-application-backend/src/models/jobModel.js
import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    company: { type: String, required: true },
    workplaceType: {
      type: String,
      enum: ["Onsite", "Remote", "Hybrid"],
      required: true,
    },
    location: { type: String, required: true },
    jobType: {
      type: String,
      enum: ["Full-time", "Part-time", "Freelance"],
      required: true,
    },
    category: { type: String, required: true },
    subCategory: { type: String, required: true },
    notificationPreference: {
      type: String,
      enum: ["In-app", "Email", "Both"],
      default: "In-app",
    },
    description: { type: String, required: true },
    hirer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export default mongoose.model("Job", jobSchema);