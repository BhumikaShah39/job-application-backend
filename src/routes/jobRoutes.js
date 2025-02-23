import express from "express";
import { addJob } from "../controllers/jobController.js";
import verifyToken from "../middlewares/authMiddleware.js";
import authorizeRoles from "../middlewares/roleMiddleware.js";
import Job from "../models/jobModel.js"; 
import { searchJobs,getSearchHistory } from "../controllers/jobController.js";

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

// Get total number of jobs
router.get("/count", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const jobCount = await Job.countDocuments({});
    res.status(200).json({ count: jobCount });
  } catch (error) {
    console.error("Error fetching job count:", error);
    res.status(500).json({ message: "Failed to fetch job count" });
  }
});


// Update job by ID
router.put("/update/:id", async (req, res) => {
  console.log("Update request received for ID:", req.params.id);
  console.log("Request body:", req.body);
  const { id } = req.params;

  try {
    const updatedJob = await Job.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedJob) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.status(200).json({ message: "Job updated successfully", job: updatedJob });
  } catch (error) {
    res.status(500).json({ message: "Failed to update job", error });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const job = await Job.findByIdAndDelete(id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete job', error });
  }
});


router.get("/search", verifyToken, searchJobs);
router.get("/search-history", verifyToken, getSearchHistory);


export default router;
