import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import multer from "multer";
import Application from "../models/applicationModel.js"; 
import Job from "../models/jobModel.js"
import Notification from "../models/notificationModel.js";
import { sendEmail } from "../utils/emailSender.js";

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
    const job = await Job.findById(jobId).populate("hirer", "email");

    const newApplication = {
      userId: req.user._id,
      jobId,
      coverLetter,
      resume: req.file ? req.file.path : null, // Save resume path 
    };

    // Save the application to the database
    await Application.create(newApplication);


    // Create In-App Notification
    const notification = new Notification({
      hirerId: job.hirer._id,
      message: `You received a new application for "${job.title}".`,
    });
    await notification.save();

    // Send Real-Time Notification
    const io = req.app.get("io");
    io.emit("newApplication", { userId: job.hirer._id, message: notification.message });

    // Send Email Notification
    if (job.hirer.email) {
      await sendEmail(job.hirer.email, "New Job Application Received", notification.message);
    }

    res.status(200).json({ message: "Application submitted successfully" });
  } catch (error) {
    console.error("Error submitting application:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



router.get('/applications/hirer',verifyToken,async(req,res) =>{
  try{
    const jobs = await Job.find({ hirer: req.user._id });
    
    const jobIds = jobs.map( jobs => jobs._id);

    const applications = await Application.find({ jobId:{ $in: jobIds}})
    .populate('userId','firstName lastName email skills education github linkedin')
    .populate('jobId','title');

    res.status(200).json(applications);
  }catch (error){
    console.error ('Error fetching applications',error);
    res.status(500).json({message:'Internal Server Error'});
  }
});


router.get('/applications/freelancer',verifyToken,async(req,res) => {
  try{
    const applications = await Application.find({userId:req.user._id})
    .populate('jobId','title company location jobType');
    res.status(200).json(applications);
  }catch(error){
    console.log("Error fetching freelancer applications",error);
    res.status(500).json({message:"Internal Server Error"});
  }
});
export default router;
