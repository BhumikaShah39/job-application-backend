import mongoose from "mongoose";

const searchHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    searchTerm: { type: String, required: true },
    category: { type: String }, // Selected category
    sortBy: { type: String, enum: ["newest", "oldest"], default: "newest" }, // Sorting preference
  },
  { timestamps: true } // Adds createdAt and updatedAt fields
);

export default mongoose.model("SearchHistory", searchHistorySchema);
