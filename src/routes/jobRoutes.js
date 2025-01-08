import express from "express";
import { addJob } from "../controllers/jobController.js";
import verifyToken from "../middlewares/authMiddleware.js";
import authorizeRoles from "../middlewares/roleMiddleware.js";
import Job from "../models/jobModel.js"; 


const router = express.Router();

// Add a job (Hirer only)
router.post("/add", verifyToken, authorizeRoles("hirer"), addJob);

router.get("/added-by-you", verifyToken, async (req, res) => {
  try {
    const jobs = await Job.find({ hirer: req.user._id }).populate("hirer", "firstName lastName");
    console.log("Decoded User ID:", req.user._id);

    if (!jobs.length) {
      return res.status(200).json({ jobs: [] }); // Return empty array if no jobs found
    }
    res.status(200).json({ jobs });
  } catch (error) {
    console.error("Error fetching hirer jobs:", error);
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
});

// Fetch all jobs
router.get("/all", verifyToken, async (req, res) => {
  try {
    const jobs = await Job.find({}).populate("hirer", "firstName lastName");
    res.status(200).json({ jobs });
  } catch (error) {
    console.error("Error fetching all jobs:", error);
    res.status(500).json({ message: "Failed to fetch jobs" });
  }
});

export default router;
