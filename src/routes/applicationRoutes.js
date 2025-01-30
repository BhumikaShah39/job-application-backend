import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import multer from "multer";
import Application from "../models/applicationModel.js"; 

const router = express.Router();

// Configure multer for file uploads 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/resumes/"); // Directory for uploaded resumes
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname); // Unique filename
  },
});

const upload = multer({ storage });

// Route to submit a job application
router.post("/applications/apply", verifyToken, upload.single("resume"), async (req, res) => {
  try {
    
    const { jobId, coverLetter } = req.body;

    const newApplication = {
      userId: req.user._id,
      jobId,
      coverLetter,
      resume: req.file ? req.file.path : null, // Save resume path 
    };

    // Save the application to the database
    await Application.create(newApplication);

    res.status(200).json({ message: "Application submitted successfully" });
  } catch (error) {
    console.error("Error submitting application:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
