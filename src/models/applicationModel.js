import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true,
  },
  coverLetter: {
    type: String,
    required: true,
  },
  resume: {
    type: String,
  },
  status: {
    type: String,
    enum: ["Pending", "MeetingScheduled", "MeetingCompleted", "Hired", "Rejected"],
    default: "Pending",
  },
}, {
  timestamps: true,
});

export default mongoose.model("Application", applicationSchema);