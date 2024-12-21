import express from 'express';
import verifyToken from '../middlewares/authMiddleware.js';
import authorizeRoles from '../middlewares/roleMiddleware.js';

import User from '../models/userModel.js';


const router = express.Router();

// Admin access 
router.get("/admin", verifyToken, authorizeRoles("admin"), (req, res) => {
  res.json({ message: "Welcome Admin" });
});

// hirer access
router.get("/hirer/:id", verifyToken, authorizeRoles("hirer"), (req, res) => {
  const hirerId = req.params.id;
  res.json({ message: `Welcome Hirer with ID: ${hirerId}` });
});

// user access
router.get("/user/:id", verifyToken, authorizeRoles("user"),async (req, res) => {
  const userId = req.params.id;
  console.log("Decoded Token User ID:", req.user._id);
  console.log("Requested User ID:", userId);
  if (req.user._id.toString() !== userId) {
    return res.status(403).json({ message: "You are not authorized to access this user's data" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user); 
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

export default router;













