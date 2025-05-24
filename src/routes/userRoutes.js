import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import authorizeRoles from "../middlewares/roleMiddleware.js";
import User from "../models/userModel.js";
import ProfileEnhancement from "../models/profileEnhancementModel.js";
import multer from "multer";
import bcrypt from "bcrypt";
import { getUserWithBadge, getCurrentUserWithBadge } from "../controllers/userController.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

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

router.get("/user/:id", verifyToken, authorizeRoles("user"), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user._id !== id) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
    const user = await User.findById(id).select(
      "firstName lastName email isProfileComplete interests education skills linkedin github experience badge"
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

router.get("/count", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const userCount = await User.countDocuments({});
    res.status(200).json({ count: userCount });
  } catch (error) {
    console.error("Error fetching user count:", error);
    res.status(500).json({ message: "Failed to fetch user count" });
  }
});

router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

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

router.put(
  "/complete-profile",
  verifyToken,
  authorizeRoles("user", "hirer"),
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const { interests, education, skills, linkedin, github, experience, khaltiId } = req.body;
      const userId = req.user._id;

      const parsedInterests = JSON.parse(interests);
      const parsedEducation = JSON.parse(education);
      const parsedSkills = JSON.parse(skills);
      const parsedExperience = JSON.parse(experience);

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (req.file) {
        user.profilePicture = req.file.path;
      }

      user.interests = parsedInterests || [];
      user.education = parsedEducation || [];
      user.skills = parsedSkills || [];
      user.linkedin = linkedin || "";
      user.github = github || "";
      user.experience = parsedExperience || [];
      if (khaltiId) {
        user.khaltiId = khaltiId;
      }

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

router.get("/current", verifyToken, getCurrentUserWithBadge);

router.get("/analytics", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const hirers = await User.countDocuments({ role: "hirer" });
    const freelancers = await User.countDocuments({ role: "user" });

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
      totalCount: totalUsers,
      dailyStats,
      hirers,
      freelancers,
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
        // Validate new password against regex
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
          return res.status(400).json({
            message:
              "New password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
          });
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

router.put(
  "/update-hirer-profile",
  verifyToken,
  authorizeRoles("hirer"),
  async (req, res) => {
    try {
      const { businessDetails, pastWork } = req.body;
      const userId = req.user._id;

      console.log("Request body:", req.body);

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

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

      if (!type || !details) {
        return res.status(400).json({ message: "Type and details are required" });
      }

      const validTypes = ["certification", "achievement", "portfolio"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: "Invalid enhancement type" });
      }

      let parsedDetails;
      try {
        parsedDetails = JSON.parse(details);
      } catch (parseError) {
        console.error("Error parsing details:", parseError);
        return res.status(400).json({ message: "Invalid details format" });
      }

      if (req.files && req.files.length > 0) {
        parsedDetails.images = req.files.map((file) => file.path);
      }

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

router.get(
  "/:id/enhancements",
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify the user exists
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch enhancements for this user
      const enhancements = await ProfileEnhancement.find({ userId: id });
      res.status(200).json(enhancements);
    } catch (error) {
      console.error("Error fetching user enhancements:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/:id",
  verifyToken,
  getUserWithBadge
);

export default router;