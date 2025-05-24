
import Notification from "../models/notificationModel.js";
import Job from "../models/jobModel.js";
import Application from "../models/applicationModel.js"; 
import Interview from "../models/interviewModel.js"; 
import { io } from "../index.js";

// Submit a Job Application
export const applyForJob = async (req, res) => {
  try {
    const { jobId, applicantDetails } = req.body;

    const job = await Job.findById(jobId).populate("hirerId");
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const newNotification = new Notification({
      hirerId: job.hirerId._id,
      message: `You received a new application for "${job.title}".`,
    });
    await newNotification.save();

    io.to(job.hirerId._id.toString()).emit("newApplication", newNotification);

    res.status(201).json({ message: "Application submitted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};