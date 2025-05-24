import User from "../models/userModel.js";
import Project from "../models/projectModel.js";
import Payment from "../models/paymentModel.js";
import Review from "../models/reviewModel.js"; // Ensure Review model is imported

// Function to calculate badges for a user
const calculateUserBadge = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    let score = 0;

    // 1. Profile Completion (20 points if complete)
    if (user.isProfileComplete) {
      score += 20;
    }

    // 2. Number of Projects/Jobs
    let projectCount = 0;
    try {
      if (user.role === "hirer") {
        projectCount = await Project.countDocuments({ hirer: userId });
      } else if (user.role === "user") {
        projectCount = await Project.countDocuments({ freelancer: userId });
      } else {
        console.warn(`User ${userId} has invalid role: ${user.role}`);
      }
    } catch (projectError) {
      console.error(`Error counting projects for user ${userId}:`, projectError.message, projectError.stack);
      projectCount = 0;
    }
    if (projectCount >= 11) {
      score += 30;
    } else if (projectCount >= 6) {
      score += 20;
    } else if (projectCount >= 1) {
      score += 10;
    }

    // 3. On-Time Performance
    let onTimePercentage = 0;
    try {
      if (user.role === "hirer") {
        const payments = await Payment.find({ hirer: userId, status: "completed" })
          .populate("project");
        if (payments.length > 0) {
          const onTimePayments = payments.filter(payment => {
            const project = payment.project;
            if (!project?.deadline) return true;
            const paymentDate = new Date(payment.createdAt);
            const deadlineDate = new Date(project.deadline);
            if (isNaN(paymentDate) || isNaN(deadlineDate)) {
              console.warn(`Invalid dates for payment ${payment._id}: createdAt=${payment.createdAt}, deadline=${project.deadline}`);
              return true;
            }
            return paymentDate <= deadlineDate;
          }).length;
          onTimePercentage = (onTimePayments / payments.length) * 100;
        } else {
          onTimePercentage = 100;
        }
      } else if (user.role === "user") {
        const projects = await Project.find({ freelancer: userId, status: "Completed" });
        if (projects.length > 0) {
          const onTimeProjects = projects.filter(project => {
            if (!project.deadline) return true;
            const projectDeadline = new Date(project.deadline);
            if (isNaN(projectDeadline)) {
              console.warn(`Invalid deadline for project ${project._id}: deadline=${project.deadline}`);
              return true;
            }
            return project.tasks.every(task => {
              if (!task.deadline) return true;
              const taskCreatedAt = new Date(task.createdAt);
              const taskDeadline = new Date(task.deadline);
              if (isNaN(taskCreatedAt) || isNaN(taskDeadline)) {
                console.warn(`Invalid dates for task in project ${project._id}: createdAt=${task.createdAt}, deadline=${task.deadline}`);
                return true;
              }
              return task.status === "Done" && taskCreatedAt <= taskDeadline;
            });
          }).length;
          onTimePercentage = (onTimeProjects / projects.length) * 100;
        } else {
          onTimePercentage = 100;
        }
      }
    } catch (onTimeError) {
      console.error(`Error calculating on-time performance for user ${userId}:`, onTimeError.message, onTimeError.stack);
      onTimePercentage = 0;
    }
    if (onTimePercentage === 100) {
      score += 20;
    } else if (onTimePercentage >= 50) {
      score += 10;
    }

    // 4. Average Rating
    let averageRating = 0;
    try {
      const reviews = await Review.find({ reviewedUser: userId });
      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        averageRating = totalRating / reviews.length;
      }
    } catch (reviewError) {
      console.error(`Error fetching reviews for user ${userId}:`, reviewError.message, reviewError.stack);
      averageRating = 0;
    }
    if (averageRating >= 4.5) {
      score += 30;
    } else if (averageRating >= 4) {
      score += 20;
    } else if (averageRating >= 3) {
      score += 10;
    }

    // Assign badge based on score
    let badge = null;
    if (score >= 80) {
      badge = "gold";
    } else if (score >= 50) {
      badge = "silver";
    } else if (score >= 20) {
      badge = "bronze";
    }

    // Update user with the new badge
    user.badge = badge;
    await user.save();

    return badge;
  } catch (error) {
    console.error("Error calculating badge:", error.message, error.stack);
    throw error;
  }
};

// Wrapper to calculate badge and return user data
const getUserWithBadge = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      console.error("Invalid user ID format:", id);
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    await calculateUserBadge(id);

    const user = await User.findById(id)
      .select("-password -googleTokens")
      .lean();

    if (!user) {
      console.error("User not found for ID:", id);
      return res.status(404).json({ message: "User not found" });
    }
    console.log("Fetched user:", user);

    let reviews = [];
    try {
      reviews = await Review.find({ reviewedUser: id })
        .populate("reviewer", "firstName lastName role")
        .populate("project", "title")
        .lean();
      console.log(`Found ${reviews.length} reviews for user ${id}`);
    } catch (reviewError) {
      console.error(`Error fetching reviews for user ${id}:`, reviewError.message, reviewError.stack);
      reviews = [];
    }

    let enhancements = [];
    if (user.role === "user") {
      try {
        const ProfileEnhancement = require("../models/profileEnhancementModel.js");
        console.log("Fetching enhancements for userId:", id);
        enhancements = await ProfileEnhancement.find({ userId: new mongoose.Types.ObjectId(id) }).lean(); // Explicitly convert to ObjectId
        console.log(`Found ${enhancements.length} enhancements for user ${id}:`, enhancements);
      } catch (enhancementError) {
        console.error(`Error fetching enhancements for user ${id}:`, enhancementError.message, enhancementError.stack);
        enhancements = [];
      }
    } else {
      console.log("User role is not 'user', skipping enhancements fetch. Role:", user.role);
    }

    res.status(200).json({ user: { ...user, reviews }, enhancements });
  } catch (error) {
    console.error("Error fetching user with badge:", error.message, error.stack);
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// Get current user with badge
const getCurrentUserWithBadge = async (req, res) => {
  try {
    console.log("Fetching user with ID:", req.user._id);
    if (!req.user._id) {
      console.log("No user ID found in token");
      return res.status(400).json({ message: "Invalid token: No user ID found" });
    }

    await calculateUserBadge(req.user._id);

    const user = await User.findById(req.user._id).select(
      "firstName lastName email role skills education profilePicture linkedin github interests experience isProfileComplete khaltiId createdAt updatedAt badge"
    );
    if (!user) {
      console.log("User not found for ID:", req.user._id);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("User fetched successfully:", user);
    const userData = user.toJSON();
    userData.khaltiId = user.khaltiId || "";
    res.status(200).json({ user: userData });
  } catch (error) {
    console.error("Error in /api/users/current:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export { calculateUserBadge, getUserWithBadge, getCurrentUserWithBadge };