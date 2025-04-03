import Job from "../models/jobModel.js";
import SavedJob from "../models/savedJobModel.js";
import SearchHistory from "../models/searchModel.js";
import Application from "../models/applicationModel.js";
import User from "../models/userModel.js";

export const getRecommendedJobs = async (req, res) => {
  try {
    console.log("User data in request:", req.user);

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let jobScores = {};

    // Fetch Saved Jobs 
    const savedJobs = await SavedJob.find({ userId }).populate("jobId");
    savedJobs.forEach((saved) => {
      if (saved.jobId && saved.jobId._id) {
        jobScores[saved.jobId._id] = (jobScores[saved.jobId._id] || 0) + 5;
      } else {
        console.log("Invalid saved job:", saved); // Debug log
      }
    });

    // Fetch Search History
    const searchHistory = await SearchHistory.find({ userId });
    await Promise.all(
      searchHistory.map(async (search) => {
        if (search.category) {
          const jobs = await Job.find({ category: search.category });
          jobs.forEach((job) => {
            if (job._id) {
              jobScores[job._id] = (jobScores[job._id] || 0) + 3;
            }
          });
        }
      })
    );

    // Fetch Past Applications
    const appliedJobs = await Application.find({ userId }).populate("jobId");
    appliedJobs.forEach((application) => {
      if (application.jobId && application.jobId._id) {
        jobScores[application.jobId._id] = (jobScores[application.jobId._id] || 0) + 2;
      } else {
        console.log("Invalid application:", application); // Debug log
      }
    });

    // Match Jobs Based on Profile Interests
    if (user.interests && user.interests.length > 0) {
      const interestJobs = await Job.find({ category: { $in: user.interests } });
      interestJobs.forEach((job) => {
        if (job._id) {
          jobScores[job._id] = (jobScores[job._id] || 0) + 4;
        }
      });
    }

    // Match Jobs Based on Skills
    if (user.skills && user.skills.length > 0) {
      const skillJobs = await Job.find({ skills: { $in: user.skills } });
      skillJobs.forEach((job) => {
        if (job._id) {
          jobScores[job._id] = (jobScores[job._id] || 0) + 4;
        }
      });
    }

    // Recommend Jobs Based on Similar Users
    if (user.interests && user.interests.length > 0) {
      const similarUsers = await User.find({ interests: { $in: user.interests } }).limit(5);
      for (const similarUser of similarUsers) {
        const theirSavedJobs = await SavedJob.find({ userId: similarUser._id }).populate("jobId");
        theirSavedJobs.forEach((job) => {
          if (job.jobId && job.jobId._id) {
            jobScores[job.jobId._id] = (jobScores[job.jobId._id] || 0) + 5;
          } else {
            console.log("Invalid similar user saved job:", job); // Debug log
          }
        });
      }
    }

    
    console.log("jobScores:", jobScores);

    // Convert jobScores object into an array and sort by highest score
    let recommendedJobs = Object.entries(jobScores)
      .filter(([jobId]) => jobId && jobId !== "undefined") // Filter out undefined keys
      .sort((a, b) => b[1] - a[1])
      .map(([jobId, score]) => ({ jobId, score }));

    
    console.log("recommendedJobs before fetch:", recommendedJobs);

    // Populate job details
    recommendedJobs = await Promise.all(
      recommendedJobs.map(async (job) => {
        if (!job.jobId || job.jobId === "undefined") {
          console.log("Skipping invalid jobId:", job.jobId);
          return null;
        }
        const jobDetails = await Job.findById(job.jobId);
        return jobDetails ? { ...jobDetails.toObject(), score: job.score } : null;
      })
    );

    recommendedJobs = recommendedJobs.filter((job) => job !== null);

    res.status(200).json({ recommendedJobs });
  } catch (error) {
    console.error("Error fetching recommendations:", error.message, error.stack);
    res.status(500).json({ error: "Server Error", details: error.message });
  }
};