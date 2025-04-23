import mongoose from "mongoose";

const interviewSchema = new mongoose.Schema({
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
    required: true,
  },
  scheduledTime: {
    type: Date,
    required: true,
  },
  meetLink: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["Scheduled", "Completed", "Failed", "Cancelled"],
    default: "Scheduled",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  googleEventId: {
    type: String,
  },
  projectCreated: { // New field to track if a project has been created
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

export default mongoose.model("Interview", interviewSchema);