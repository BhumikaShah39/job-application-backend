import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import multer from "multer";
import Application from "../models/applicationModel.js"; 
import Job from "../models/jobModel.js"

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
