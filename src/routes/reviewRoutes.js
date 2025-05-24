import express from "express";
import Review from "../models/reviewModel.js";
import verifyToken from "../middlewares/authMiddleware.js";
import { calculateUserBadge } from "../controllers/userController.js"; // Import to recalculate badge

const router = express.Router();

// Create a new review
router.post("/", verifyToken, async (req, res) => {
  try {
    const { project, payment, reviewer, reviewedUser, rating, comment } = req.body;

    // Validate required fields
    if (!project || !payment || !reviewer || !reviewedUser || !rating) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    const review = new Review({
      project,
      payment,
      reviewer,
      reviewedUser,
      rating,
      comment,
    });

    await review.save();

    // Recalculate badge for the reviewed user since their rating has changed
    await calculateUserBadge(reviewedUser);

    res.status(201).json({ message: "Review added successfully", review });
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get all reviews for a specific user
router.get("/user/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const reviews = await Review.find({ reviewedUser: id })
      .populate("reviewer", "firstName lastName role")
      .populate("project", "title");

    res.status(200).json(reviews);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Optional: Get a specific review by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid review ID format" });
    }

    const review = await Review.findById(id)
      .populate("reviewer", "firstName lastName role")
      .populate("reviewedUser", "firstName lastName role")
      .populate("project", "title");

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.status(200).json(review);
  } catch (error) {
    console.error("Error fetching review:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Optional: Delete a review (e.g., for admins or the reviewer)
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid review ID format" });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Optionally, add role-based authorization (e.g., only admin or reviewer can delete)
    if (req.user._id.toString() !== review.reviewer.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized to delete this review" });
    }

    await Review.findByIdAndDelete(id);

    // Recalculate badge for the reviewed user since their rating has changed
    await calculateUserBadge(review.reviewedUser);

    res.status(200).json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

export default router;