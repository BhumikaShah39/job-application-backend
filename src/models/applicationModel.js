import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true },
    coverLetter: { type: String, required: true },
    resume: { type: String }, // File path of uploaded resume
    status: { type: String, default: "Pending" }, // e.g., Pending, Approved, Rejected
  },
  { timestamps: true }
);

const Application = mongoose.model("Application", applicationSchema);
export default Application;
