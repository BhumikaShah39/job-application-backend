// models/profileEnhancementModel.js
import mongoose from "mongoose";

const profileEnhancementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["certification", "achievement", "portfolio"],
    required: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
}, { timestamps: true });

export default mongoose.model("ProfileEnhancement", profileEnhancementSchema);