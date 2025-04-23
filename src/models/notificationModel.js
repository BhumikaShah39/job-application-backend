import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    freelancerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    hirerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application" },
  },
  
);

export default mongoose.model("Notification", notificationSchema);
