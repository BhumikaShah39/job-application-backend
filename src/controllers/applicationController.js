// controllers/applicationController.js
import Notification from "../models/notificationModel.js";
import Job from "../models/jobModel.js"; // Assuming you have a Job model
import { io } from "../index.js"; // Import the initialized Socket.IO instance

// Submit a Job Application
export const applyForJob = async (req, res) => {
  try {
    const { jobId, applicantDetails } = req.body;

    // Find the job to get the hirerId
    const job = await Job.findById(jobId).populate("hirerId");
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // ✅ Notification Logic
    const newNotification = new Notification({
      hirerId: job.hirerId._id, // Correct reference to hirerId
      message: `You received a new application for "${job.title}".`,
    });
    await newNotification.save();

    // 🔔 Emit Real-Time Notification to the hirer
    io.to(job.hirerId._id.toString()).emit("newApplication", newNotification);

    res.status(201).json({ message: "Application submitted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
