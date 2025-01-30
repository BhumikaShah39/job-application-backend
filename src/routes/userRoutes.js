import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import authorizeRoles from "../middlewares/roleMiddleware.js";
import User from "../models/userModel.js";
import multer from "multer";
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); //directory where uploaded files will be stored
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname); // Generate a unique filename
  },
});

const upload = multer({ storage });

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

    
    if (req.user._id !== id) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    
    const user = await User.findById(id).select("firstName lastName email isProfileComplete interests education skills linkedin github experience");
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

// userRoutes.js
router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password"); 
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});



// Update profile for freelancers
router.put("/complete-profile", verifyToken, authorizeRoles("user"),upload.single("profilePicture"), async (req, res) => {
  try {
    
    const { interests, education, skills, linkedin, github, experience } = req.body;

    const userId = req.user._id; // Extract user ID from the token

     // Validate file upload
     if (!req.file) {
      return res.status(400).json({ message: "Profile picture is required." });
    }

    // Parse JSON strings from the frontend
    const parsedInterests = JSON.parse(interests);
    const parsedEducation = JSON.parse(education);
    const parsedSkills = JSON.parse(skills);
    const parsedExperience = JSON.parse(experience);

    // Find the user in the database
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

       // Update user profile fields
       user.profilePicture = req.file.path;
       user.interests = parsedInterests || [];
       user.education = parsedEducation || [];
       user.skills = parsedSkills || [];
       user.linkedin = linkedin || "";
       user.github = github || "";
       user.experience = parsedExperience || [];

    

    // Check if all required fields are filled
    const isComplete =
        user.profilePicture &&
        user.interests.length > 0 &&
        user.education.length > 0 &&
        user.skills.length > 0 &&
        user.linkedin &&
        user.github &&
        user.experience.length > 0;

    user.isProfileComplete = isComplete; 

    // Save the updated user to the database
    await user.save();
    const updatedUser = await User.findById(userId);

    res.status(200).json({
      message: isComplete
        ? "Profile updated and marked as complete"
        : "Profile updated, but still incomplete",
      user,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get('/current', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'firstName lastName email role skills education profilePicture linkedin github interests experience isProfileComplete'
    ); 
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ user }); 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});






export default router;
