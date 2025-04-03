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
    enum: ["Scheduled", "Completed", "Cancelled"],
    default: "Scheduled",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true, // The hirer who scheduled the interview
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt fields automatically
});

export default mongoose.model("Interview", interviewSchema);