import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import authorizeRoles from "../middlewares/roleMiddleware.js";
import User from "../models/userModel.js";
import ProfileEnhancement from "../models/profileEnhancementModel.js";
import multer from "multer";
import bcrypt from "bcrypt";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// Admin access
router.get("/admin/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user._id !== id) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
    res.json({ message: `Welcome Admin with ID: ${id}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

// Hirer access
router.get("/hirer/:id", verifyToken, authorizeRoles("hirer"), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user._id !== id) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
    res.json({ message: `Welcome Hirer with ID: ${id}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

// Freelancer/User access
router.get("/user/:id", verifyToken, authorizeRoles("user"), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user._id !== id) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
    const user = await User.findById(id).select(
      "firstName lastName email isProfileComplete interests education skills linkedin github experience"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get total number of users
router.get("/count", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const userCount = await User.countDocuments({});
    res.status(200).json({ count: userCount });
  } catch (error) {
    console.error("Error fetching user count:", error);
    res.status(500).json({ message: "Failed to fetch user count" });
  }
});

// Get all users
router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// Delete a user (Admin only)
router.delete("/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

// Update profile for freelancers
router.put(
  "/complete-profile",
  verifyToken,
  authorizeRoles("user", "hirer"),
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const { interests, education, skills, linkedin, github, experience, khaltiId } = req.body; // Added khaltiId
      const userId = req.user._id;

      // Parse the incoming data
      const parsedInterests = JSON.parse(interests);
      const parsedEducation = JSON.parse(education);
      const parsedSkills = JSON.parse(skills);
      const parsedExperience = JSON.parse(experience);

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update profile picture if provided
      if (req.file) {
        user.profilePicture = req.file.path;
      }

      // Update fields
      user.interests = parsedInterests || [];
      user.education = parsedEducation || [];
      user.skills = parsedSkills || [];
      user.linkedin = linkedin || "";
      user.github = github || "";
      user.experience = parsedExperience || [];
      if (khaltiId) { // Update khaltiId if provided
        user.khaltiId = khaltiId;
      }

      // Role-specific isProfileComplete logic
      let isComplete;
      if (user.role === "user") {
        isComplete =
          user.profilePicture &&
          user.interests.length > 0 &&
          user.education.length > 0 &&
          user.skills.length > 0 &&
          user.linkedin &&
          user.github &&
          user.experience.length > 0;
      } else if (user.role === "hirer") {
        isComplete =
          user.profilePicture &&
          user.businessDetails?.companyName &&
          user.businessDetails?.industry &&
          user.pastWork?.length > 0;
      }

      user.isProfileComplete = isComplete;

      await user.save();
      res.status(200).json({
        message: isComplete
          ? "Profile updated and marked as complete"
          : "Profile updated, but still incomplete",
        user,
      });
    } catch (error) {
      console.error("Error updating profile:", error.message, error.stack);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);


// userRoutes.js (fixed)
router.get("/current", verifyToken, async (req, res) => {
  try {
    console.log("Fetching user with ID:", req.user._id);
    if (!req.user._id) {
      console.log("No user ID found in token");
      return res.status(400).json({ message: "Invalid token: No user ID found" });
    }

    const user = await User.findById(req.user._id).select(
      "firstName lastName email role skills education profilePicture linkedin github interests experience isProfileComplete khaltiId createdAt updatedAt"
    );
    if (!user) {
      console.log("User not found for ID:", req.user._id);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("User fetched successfully:", user);
    const userData = user.toJSON();
    userData.khaltiId = user.khaltiId || ""; // Fallback to empty string
    res.status(200).json({ user: userData });
  } catch (error) {
    console.error("Error in /api/users/current:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});
// Get user analytics (updated for daily stats)
router.get("/analytics", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const hirers = await User.countDocuments({ role: "hirer" });
    const freelancers = await User.countDocuments({ role: "user" });

    // Calculate user growth (daily signups)
    const dailyStats = await User.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id": 1 } },
      { $project: { date: "$_id", count: 1, _id: 0 } },
    ]);

    res.status(200).json({
      totalCount: totalUsers,  // Changed to match frontend expectation
      dailyStats,              // Changed to daily stats in expected format
      hirers,                  // Keeping additional data
      freelancers,             // Keeping additional data
    });
  } catch (error) {
    console.error("Error fetching user analytics:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put(
  "/update-account",
  verifyToken,
  authorizeRoles("user", "hirer"),
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const { email, currentPassword, newPassword } = req.body;
      const userId = req.user._id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate current password if provided
      if (currentPassword || newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ message: "Current password is required to update password" });
        }
        const isMatch = await bcrypt.compare(currentPassword.trim(), user.password);
        if (!isMatch) {
          return res.status(400).json({ message: "Current password is incorrect" });
        }
        if (!newPassword) {
          return res.status(400).json({ message: "New password is required to update password" });
        }
        const saltRounds = 10;
        user.password = await bcrypt.hash(newPassword, saltRounds);
      }

      if (email) {
        user.email = email;
      }
      if (req.file) {
        user.profilePicture = req.file.path;
      }

      await user.save();
      res.status(200).json({ message: "Account updated successfully", user });
    } catch (error) {
      console.error("Error updating account:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Update hirer-specific details (business details, past work)
router.put(
  "/update-hirer-profile",
  verifyToken,
  authorizeRoles("hirer"),
  async (req, res) => {
    try {
      const { businessDetails, pastWork } = req.body;
      const userId = req.user._id;

      console.log("Request body:", req.body); // Log the incoming request body

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update fields directly without JSON.parse since data is already a JavaScript object
      if (businessDetails) {
        console.log("Updating businessDetails:", businessDetails);
        user.businessDetails = businessDetails;
      }
      if (pastWork) {
        console.log("Updating pastWork:", pastWork);
        user.pastWork = pastWork;
      }

      const isComplete =
        user.profilePicture &&
        user.businessDetails?.companyName &&
        user.businessDetails?.industry &&
        user.pastWork?.length > 0;

      user.isProfileComplete = isComplete;
      await user.save();

      console.log("User updated successfully:", user);

      res.status(200).json({
        message: isComplete
          ? "Profile updated and marked as complete"
          : "Profile updated, but still incomplete",
        user,
      });
    } catch (error) {
      console.error("Error updating hirer profile:", error.message, error.stack);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);

router.post(
  "/add-enhancement",
  verifyToken,
  authorizeRoles("user"),
  upload.array("images", 5),
  async (req, res) => {
    try {
      const { type, details } = req.body;
      const userId = req.user._id;

      // Validate required fields
      if (!type || !details) {
        return res.status(400).json({ message: "Type and details are required" });
      }

      // Validate type against enum
      const validTypes = ["certification", "achievement", "portfolio"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid enhancement type" });
      }

      // Parse details safely
      let parsedDetails;
      try {
        parsedDetails = JSON.parse(details);
      } catch (parseError) {
        console.error("Error parsing details:", parseError);
        return res.status(400).json({ message: "Invalid details format" });
      }

      // Add images to parsedDetails if files were uploaded
      if (req.files && req.files.length > 0) {
        parsedDetails.images = req.files.map((file) => file.path);
      }

      // Create and save the enhancement
      const enhancement = new ProfileEnhancement({
        userId,
        type,
        details: parsedDetails,
      });

      await enhancement.save();
      res.status(201).json({ message: "Enhancement added successfully", enhancement });
    } catch (error) {
      console.error("Error adding enhancement:", error.message, error.stack);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);

// Get freelancer enhancements (already implemented)
router.get(
  "/enhancements",
  verifyToken,
  authorizeRoles("user"),
  async (req, res) => {
    try {
      const userId = req.user._id;
      const enhancements = await ProfileEnhancement.find({ userId });
      res.status(200).json(enhancements);
    } catch (error) {
      console.error("Error fetching enhancements:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Get user details by ID (for viewing hirer/freelancer details)
router.get(
  "/:id",
  verifyToken,
  async (req, res) => {
    try {
      // Validate ObjectId format to prevent CastError
      const { id } = req.params;
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: "Invalid user ID format" });
      }

      const user = await User.findById(id)
        .select("-password -googleTokens")
        .populate("ratings.ratedBy", "firstName lastName role")
        .lean(); // Use lean() to convert to plain JavaScript object for better error handling

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Handle enhancements for freelancers
      let enhancements = [];
      if (user.role === "user") {
        enhancements = await ProfileEnhancement.find({ userId: id }).lean();
      }

      res.status(200).json({ user, enhancements });
    } catch (error) {
      console.error("Error fetching user:", error.message, error.stack);
      if (error.name === "CastError") {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);

router.post(
  "/rate/:id",
  verifyToken,
  async (req, res) => {
    const { rating, comment } = req.body;
    const userId = req.params.id;
    const raterId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.ratings.push({
      ratedBy: raterId,
      rating,
      comment,
    });
    await user.save();

    res.status(200).json({ message: "Rating submitted successfully" });
  }
);

export default router;