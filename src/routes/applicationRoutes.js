import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import multer from "multer";
import Application from "../models/applicationModel.js";
import Job from "../models/jobModel.js";
import Notification from "../models/notificationModel.js";
import  User  from "../models/userModel.js";
import { sendEmail } from "../utils/emailSender.js";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import Interview from "../models/interviewModel.js"

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads", "resumes");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit to 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only PDF, DOC, and DOCX files are allowed!"));
  },
});

// Route to submit a job application
router.post("/applications/apply", verifyToken, upload.single("resume"), async (req, res) => {
  try {
    const { jobId, coverLetter } = req.body;

    // Validate required fields
    if (!jobId || !coverLetter) {
      return res.status(400).json({ message: "Job ID and cover letter are required" });
    }

    // Check if job exists
    const job = await Job.findById(jobId).populate("hirer", "email");
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Check if hirer exists
    if (!job.hirer || !job.hirer._id) {
      return res.status(400).json({ message: "Hirer information is missing for this job" });
    }

    const newApplication = {
      userId: req.user._id,
      jobId,
      coverLetter,
      resume: req.file ? req.file.path : null,
    };

    // Save the application to the database
    const application = await Application.create(newApplication);
    if (!application) {
      throw new Error("Failed to save application to the database");
    }

    // Create In-App Notification for the hirer
    const notification = new Notification({
      
      hirerId: job.hirer._id,
      message: `You received a new application for "${job.title}".`,
      applicationId: application._id,
    });
    await notification.save();

    // Send Real-Time Notification
    const io = req.app.get("io");
    if (io) {
      io.to(job.hirer._id.toString()).emit("newApplication", {
        userId: job.hirer._id,
        message: notification.message,
        applicationId: application._id,
      });
      console.log("Real-time notification sent to hirer:", job.hirer._id);
    } else {
      console.warn("Socket.IO instance not found");
    }

    // Send Email Notification
    if (job.hirer.email) {
      try {
        await sendEmail(job.hirer.email, "New Job Application Received", notification.message);
        console.log("Email notification sent to hirer:", job.hirer.email);
      } catch (emailError) {
        console.warn("Email sending failed:", emailError.message);
        // Continue even if email fails
      }
    }

    res.status(201).json({ message: "Application submitted successfully", application });
  } catch (error) {
    console.error("Error submitting application:", error.message, error.stack);

    // Clean up uploaded file if it exists
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting uploaded file:", err);
      });
    }

    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});


router.get("/applications/hirer", verifyToken, async (req, res) => {
  try {
    // Validate req.user._id
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const jobs = await Job.find({ hirer: req.user._id });
    const jobIds = jobs.map((job) => job._id);

    const applications = await Application.find({ jobId: { $in: jobIds } })
      .populate("userId", "firstName lastName email skills education github linkedin")
      .populate("jobId", "title");
    console.log("Applications fetched for hirer:", req.user._id, applications);
    res.status(200).json(applications);
  } catch (error) {
    console.error("Error fetching applications", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/applications/freelancer", verifyToken, async (req, res) => {
  try {
    // Validate req.user._id
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const applications = await Application.find({ userId: req.user._id }).populate(
      "jobId",
      "title company location jobType"
    );
    console.log("Applications fetched for freelancer:", req.user._id, applications);
    res.status(200).json(applications);
  } catch (error) {
    console.error("Error fetching freelancer applications", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.put("/applications/:id/status", verifyToken, async (req, res) => {
  try {
    // Validate req.user._id
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const { status: applicationStatus } = req.body;
    const application = await Application.findById(req.params.id)
      .populate("userId", "email firstName")
      .populate("jobId", "title company hirer");

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (!application.jobId || !application.jobId.hirer) {
      return res.status(400).json({ message: "Hirer ID is missing in the job data." });
    }

    if (application.jobId.hirer._id.toString() !== req.user._id) {
      return res.status(403).json({ message: "Unauthorized: You are not the hirer for this job" });
    }

    application.status = applicationStatus;
    await application.save();

    const notification = new Notification({
      freelancerId: application.userId._id,
      message: applicationStatus === "Accepted"
        ? `Your application for "${application.jobId.title}" at ${application.jobId.company} has been accepted! 🎉`
        : `Unfortunately, your application for "${application.jobId.title}" at ${application.jobId.company} was rejected. 😔`,
    });
    await notification.save();

    const io = req.app.get("io");
    if (io) {
      io.to(application.userId._id.toString()).emit("applicationStatusUpdate", {
        freelancerId: application.userId._id.toString(),
        message: notification.message,
        applicationId: application._id,
      });
    } else {
      console.warn("Socket.IO instance not found");
    }

    if (application.userId.email) {
      const emailSubject = `Application Status Update: ${application.jobId.title}`;
      const emailBody = `
        Hello ${application.userId.firstName || "Freelancer"},
        
        We wanted to inform you about the status of your application submitted on ${new Date(application.createdAt).toLocaleDateString()}:
        
        - **Role**: ${application.jobId.title}
        - **Company**: ${application.jobId.company}
        - **Status**: ${applicationStatus === "Accepted" ? "Approved" : "Rejected"}
        
        ${
          applicationStatus === "Accepted"
            ? "Congratulations! The hirer has accepted your application. Check your 'My Applications' page for more details."
            : "We’re sorry to inform you that your application was not successful this time. Keep applying to other opportunities!"
        }
        
        Best regards,
        The Karya Team
      `;
      try {
        await sendEmail(application.userId.email, emailSubject, emailBody);
      } catch (emailError) {
        console.warn("Email sending failed:", emailError.message);
      }
    }


    // Check if the hirer has authenticated with Google by looking at the user's googleTokens in the database
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
   // Check if the hirer has authenticated with Google
const isGoogleAuthenticated = !!user.googleTokens;
console.log("User Google Authenticated:", isGoogleAuthenticated);
    res.status(200).json({
      message: `Application ${applicationStatus} successfully`,
      isGoogleAuthenticated, // Signal frontend to show scheduling pop-up if true
      applicationId: application._id,
    });
  } catch (error) {
    console.error("Error updating application status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/interviews", verifyToken, async (req, res) => {
  try {
    // Validate req.user._id
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const { applicationId, scheduledTime } = req.body;

    // Validate request
    if (!applicationId || !scheduledTime) {
      return res.status(400).json({ message: "Application ID and scheduled time are required" });
    }

    // Validate scheduledTime format
    const scheduledDate = new Date(scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ message: "Invalid scheduled time format" });
    }

    // Fetch the hirer to get Google OAuth tokens
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

   // Check if theMAT hirer has authenticated with Google
   if (!user.googleTokens) {
    return res.status(401).json({ message: "Google authentication required. Please authenticate with Google first." });
  }

    // Set up Google Calendar API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
   
    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        user.googleTokens = tokens;
        await user.save();
        console.log("Google OAuth tokens updated for user:", user._id);
      }
    });

    oauth2Client.setCredentials(user.googleTokens);

    // Refresh token if expired
    oauth2Client.setCredentials(user.googleTokens);
    if (user.googleTokens.expiry_date && user.googleTokens.expiry_date <= Date.now()) {
      console.log("Access token expired, attempting to refresh...");
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        user.googleTokens = credentials;
        await user.save();
        console.log("Access token refreshed successfully for user:", user._id);
        oauth2Client.setCredentials(credentials);
      } catch (refreshError) {
        console.error("Error refreshing access token:", refreshError.message, refreshError.stack);
        return res.status(401).json({ message: "Failed to refresh Google access token. Please re-authenticate with Google." });
      }
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Fetch application details
    const application = await Application.findById(applicationId)
      .populate("userId", "email firstName")
      .populate({
        path: "jobId",
        select: "title company",
        populate: {
          path: "hirer",
          select: "email",
        },
      });

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Verify that the hirer making the request is the one associated with the job
    if (application.jobId.hirer._id.toString() !== req.user._id) {
      return res.status(403).json({ message: "Unauthorized: You are not the hirer for this job" });
    }

    // Validate email addresses
    const freelancerEmail = application.userId?.email;
    const hirerEmail = application.jobId.hirer?.email;

    // Log the emails for debugging
    console.log("Freelancer Email:", freelancerEmail);
    console.log("Hirer Email:", hirerEmail);

    // Check if emails exist
    if (!freelancerEmail || !hirerEmail) {
      return res.status(400).json({ message: "Freelancer or hirer email is missing" });
    }

   // Validate email format
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
   if (!emailRegex.test(freelancerEmail)) {
     return res.status(400).json({ message: `Invalid freelancer email address: ${freelancerEmail}` });
   }
   if (!emailRegex.test(hirerEmail)) {
     return res.status(400).json({ message: `Invalid hirer email address: ${hirerEmail}` });
   }

    // Create Google Calendar event with Google Meet link
    const event = {
      summary: `Interview for ${application.jobId.title} at ${application.jobId.company}`,
      description: `Interview with ${application.userId.firstName} for the role of ${application.jobId.title}.`,
      start: {
        dateTime: new Date(scheduledTime).toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: new Date(new Date(scheduledTime).getTime() + 60 * 60 * 1000).toISOString(), // 1 hour later
        timeZone: "UTC",
      },
      organizer: {
        email: hirerEmail, // Explicitly set the hirer as the organizer
      },
      attendees: [
        { email: freelancerEmail,responseStatus: "needsAction" }, // Freelancer
        { email: hirerEmail ,responseStatus: "accepted"}, // Hirer
      ],
      conferenceData: {
        createRequest: {
          requestId: `karya-interview-${application._id}`,
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      },
    };

    console.log("Creating Google Calendar event with data:", event);

    const calendarEvent = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    const meetLink = calendarEvent.data.hangoutLink;
    console.log("Google Calendar event created successfully:", calendarEvent.data);

    

    // Save interview details to the database
    const interview = new Interview({
      applicationId,
      scheduledTime: scheduledDate,
      meetLink,
      createdBy: req.user._id,
    });
    await interview.save();
    console.log("Interview saved to database:", interview);

    // Notify freelancer via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(application.userId._id.toString()).emit("interviewScheduled", {
        freelancerId: application.userId._id.toString(),
        message: `An interview has been scheduled for "${application.jobId.title}" at ${application.jobId.company} on ${new Date(scheduledTime).toLocaleString()}. Join here: ${meetLink}`,
        meetLink,
        scheduledTime,
      });
      console.log("Real-time notification sent to freelancer:", application.userId._id);
    }else {
      console.warn("Socket.IO instance not found");
    }

    // Send email notification to freelancer
    if (application.userId.email) {
      const emailSubject = `Interview Scheduled: ${application.jobId.title}`;
      const emailBody = `
        Hello ${application.userId.firstName || "Freelancer"},
        
        An interview has been scheduled for your application for "${application.jobId.title}" at ${application.jobId.company}.
        - **Date & Time**: ${scheduledDate.toLocaleString()}
        - **Google Meet Link**: ${meetLink}
        
        Please join the meeting at the scheduled time.
        
        Best regards,
        The Karya Team
      `;
      try {
        await sendEmail(application.userId.email, emailSubject, emailBody);
      } catch (emailError) {
        console.warn("Email sending failed:", emailError.message);
      }
    }

    // Send email notification to hirer
if (application.jobId.hirer.email) {
  const emailSubject = `Interview Scheduled: ${application.jobId.title}`;
  const emailBody = `
    Hello Hirer,
    
    You have scheduled an interview for the role of "${application.jobId.title}" at ${application.jobId.company}.
    - **Candidate**: ${application.userId.firstName || "Freelancer"}
    - **Date & Time**: ${scheduledDate.toLocaleString()}
    - **Google Meet Link**: ${meetLink}
    
    Please join the meeting at the scheduled time to conduct the interview.
    
    Best regards,
    The Karya Team
  `;
  try {
    await sendEmail(application.jobId.hirer.email, emailSubject, emailBody);
    console.log("Email notification sent to hirer:", application.jobId.hirer.email);
  } catch (emailError) {
    console.warn("Email sending failed for hirer:", emailError.message);
  }
}

    res.status(201).json({ message: "Interview scheduled successfully", interview });
  } catch (error) {
    console.error("Error scheduling interview:", error.message,error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// GET /api/interviews
router.get("/interviews", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;

    const interviews = await Interview.find({})
      .populate({
        path: "applicationId",
        populate: [
          { path: "userId", select: "firstName lastName email" },
          { path: "jobId", select: "title company hirer" ,
            populate: {
              path: "hirer",
              select: "firstName lastName email", 
            },
          }
        ],
      })
      .populate("createdBy", "firstName lastName email")
      .sort({ scheduledTime: -1 });

    const filteredInterviews = interviews.filter(interview => {
      const isFreelancer = interview.applicationId?.userId?._id?.toString() === userId.toString();
      const isHirer = interview.createdBy?._id?.toString() === userId.toString();
      return isFreelancer || isHirer;
    });

    res.status(200).json(filteredInterviews);
  } catch (error) {
    console.error("Error fetching interviews:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// PUT /api/interviews/:id - Reschedule Interview
router.put("/interviews/:id", verifyToken, async (req, res) => {
  try {
    const { scheduledTime } = req.body;
    const interview = await Interview.findById(req.params.id)
      .populate({
        path: "applicationId",
        populate: [
          { path: "userId", select: "email firstName" },
          { path: "jobId", select: "title company hirer" }
        ],
      });

    if (!interview) return res.status(404).json({ message: "Interview not found" });

    if (interview.createdBy.toString() !== req.user._id)
      return res.status(403).json({ message: "Unauthorized" });

    interview.scheduledTime = new Date(scheduledTime);
    await interview.save();

    // Notify freelancer
    const freelancer = interview.applicationId.userId;
    const job = interview.applicationId.jobId;

    const io = req.app.get("io");
    if (io) {
      io.to(freelancer._id.toString()).emit("interviewRescheduled", {
        freelancerId: freelancer._id.toString(),
        message: `The interview for "${job.title}" has been rescheduled to ${new Date(scheduledTime).toLocaleString()}`,
      });
    }

    if (freelancer.email) {
      const emailBody = `
        Hello ${freelancer.firstName},
        The interview for the position of ${job.title} has been rescheduled.
        New Time: ${new Date(scheduledTime).toLocaleString()}
        Google Meet Link: ${interview.meetLink}
      `;
      await sendEmail(freelancer.email, "Interview Rescheduled", emailBody);
    }

    res.status(200).json({ message: "Interview rescheduled", interview });
  } catch (error) {
    console.error("Error rescheduling interview:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// DELETE /api/interviews/:id - Cancel Interview
router.delete("/interviews/:id", verifyToken, async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id)
      .populate({
        path: "applicationId",
        populate: [
          { path: "userId", select: "email firstName" },
          { path: "jobId", select: "title company" }
        ],
      });

    if (!interview) return res.status(404).json({ message: "Interview not found" });

    if (interview.createdBy.toString() !== req.user._id)
      return res.status(403).json({ message: "Unauthorized" });

    interview.status = "Cancelled";
    await interview.save();

    const freelancer = interview.applicationId.userId;
    const job = interview.applicationId.jobId;

    const io = req.app.get("io");
    if (io) {
      io.to(freelancer._id.toString()).emit("interviewCancelled", {
        freelancerId: freelancer._id.toString(),
        message: `The interview for "${job.title}" has been cancelled.`,
      });
    }

    if (freelancer.email) {
      const emailBody = `
        Hello ${freelancer.firstName},
        The interview for the position of ${job.title} has been cancelled.
        Please contact the hirer for more information.
      `;
      await sendEmail(freelancer.email, "Interview Cancelled", emailBody);
    }

    res.status(200).json({ message: "Interview cancelled", interview });
  } catch (error) {
    console.error("Error cancelling interview:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});





export default router;