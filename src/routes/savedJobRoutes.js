// routes/savedJobRoutes.js
import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import SavedJob from "../models/savedJobModel.js";

const router = express.Router();

// Save a job
router.post("/save", verifyToken, async (req, res) => {
  try {
    console.log("Saving job for user:", req.user._id);
    const { jobId } = req.body;
    console.log("Received jobId:", jobId); 
    const existingSave = await SavedJob.findOne({
      userId: req.user._id,
      jobId,
    });

    if (existingSave) {
      console.log("Job already saved.");
      return res.status(400).json({ message: "Job already saved." });
    }

    const savedJob = new SavedJob({ userId: req.user._id, jobId });
    await savedJob.save();
    console.log("Job saved successfully.");
    res.status(201).json({ message: "Job saved successfully!" });
  } catch (error) {
    console.error("Error saving job:", error);
    res.status(500).json({ message: "Failed to save job", error });
  }
});

// Get saved jobs
router.get("/", verifyToken, async (req, res) => {
  try {
    console.log("Fetching saved jobs for user:", req.user._id);
    const savedJobs = await SavedJob.find({ userId: req.user._id }).populate("jobId");
    console.log("Fetched saved jobs:", savedJobs);
    res.status(200).json(savedJobs);
  } catch (error) {
    console.error("Error fetching saved jobs:", error);
    res.status(500).json({ message: "Failed to fetch saved jobs", error });
  }
});

// Remove saved job
router.delete("/unsave/:jobId", verifyToken, async (req, res) => {
  try {
    console.log("Un-saving job:", req.params.jobId);
    await SavedJob.findOneAndDelete({
      userId: req.user._id,
      jobId: req.params.jobId,
    });
    console.log("Job unsaved successfully.");
    res.status(200).json({ message: "Job unsaved successfully" });
  } catch (error) {
    console.error("Error unsaving job:", error);
    res.status(500).json({ message: "Failed to unsave job", error });
  }
});



export default router;
