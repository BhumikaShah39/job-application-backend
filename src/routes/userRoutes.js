import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import authorizeRoles from "../middlewares/roleMiddleware.js";
import User from "../models/userModel.js"
const router = express.Router();

// Admin access
router.get("/admin/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { id } = req.params; // Extract user ID from route parameter
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
    const { id } = req.params; // Extract user ID from route parameter
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

    // Ensure the authenticated user matches the requested ID
    if (req.user._id !== id) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // Fetch user data from the database
    const user = await User.findById(id).select("firstName lastName email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user); // Send the full user data as a response
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

// userRoutes.js
router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password"); // Exclude sensitive data
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});


export default router;
