// job-application-backend/src/routes/applicationRoutes.js
import express from "express";
import verifyToken from "../middlewares/authMiddleware.js";
import multer from "multer";
import Application from "../models/applicationModel.js";
import Job from "../models/jobModel.js";
import Notification from "../models/notificationModel.js";
import User from "../models/userModel.js";
import ProfileEnhancement from "../models/profileEnhancementModel.js";
import { sendEmail } from "../utils/emailSender.js";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import Interview from "../models/interviewModel.js";

const router = express.Router();

const uploadsDir = path.join(process.cwd(), "uploads", "resumes");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
  limits: { fileSize: 5 * 1024 * 1024 },
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

    if (!jobId || !coverLetter) {
      return res.status(400).json({ message: "Job ID and cover letter are required" });
    }

    const job = await Job.findById(jobId).populate("hirer", "email");
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (!job.hirer || !job.hirer._id) {
      return res.status(400).json({ message: "Hirer information is missing for this job" });
    }

    const newApplication = {
      userId: req.user._id,
      jobId,
      coverLetter,
      resume: req.file ? req.file.path : null,
    };

    const application = await Application.create(newApplication);
    if (!application) {
      throw new Error("Failed to save application to the database");
    }

    const notification = new Notification({
      hirerId: job.hirer._id,
      message: `You received a new application for "${job.title}".`,
      applicationId: application._id,
    });
    await notification.save();

    const io = req.app.get("io");
    if (io) {
      io.to(job.hirer._id.toString()).emit("newApplication", {
        userId: job.hirer._id,
        message: notification.message,
        applicationId: application._id,
      });
    }

    if (job.hirer.email) {
      await sendEmail(job.hirer.email, "New Job Application Received", notification.message);
    }

    res.status(201).json({ message: "Application submitted successfully", application });
  } catch (error) {
    console.error("Error submitting application:", error.message, error.stack);

    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting uploaded file:", err);
      });
    }

    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get all applications for a hirer
router.get("/applications/hirer", verifyToken, async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const jobs = await Job.find({ hirer: req.user._id });
    const jobIds = jobs.map((job) => job._id);

    const applications = await Application.find({ jobId: { $in: jobIds } })
      .populate({
        path: "userId",
        select: "firstName lastName email skills education github linkedin profilePicture experience",
      })
      .populate("jobId", "title");

    const applicationsWithEnhancements = await Promise.all(
      applications.map(async (app) => {
        const enhancements = await ProfileEnhancement.find({ userId: app.userId._id });
        return { ...app.toObject(), userId: { ...app.userId.toObject(), enhancements } };
      })
    );

    res.status(200).json(applicationsWithEnhancements);
  } catch (error) {
    console.error("Error fetching applications", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Updated route to get pending applications (previously "accepted")
router.get("/applications/hirer/pending-decision", verifyToken, async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const jobs = await Job.find({ hirer: req.user._id });
    const jobIds = jobs.map((job) => job._id);

    const applications = await Application.find({
      jobId: { $in: jobIds },
      status: "MeetingCompleted",
    })
      .populate("userId", "firstName lastName email skills education github linkedin")
      .populate("jobId", "title");

    const applicationsWithInterviews = await Promise.all(
      applications.map(async (app) => {
        const interview = await Interview.findOne({
          applicationId: app._id,
          status: "Completed",
        });
        return { ...app.toObject(), interview };
      })
    );

    const filteredApplications = applicationsWithInterviews.filter(
      (app) => app.interview
    );

    res.status(200).json(filteredApplications);
  } catch (error) {
    console.error("Error fetching pending applications:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// New route to get hired applicants
router.get("/applications/hirer/hired", verifyToken, async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const jobs = await Job.find({ hirer: req.user._id });
    const jobIds = jobs.map((job) => job._id);

    const applications = await Application.find({
      jobId: { $in: jobIds },
      status: "Hired",
    })
      .populate("userId", "firstName lastName email skills education github linkedin")
      .populate("jobId", "title");

    const applicationsWithInterviews = await Promise.all(
      applications.map(async (app) => {
        const interview = await Interview.findOne({
          applicationId: app._id,
          status: "Completed",
        });
        return { ...app.toObject(), interview };
      })
    );

    res.status(200).json(applicationsWithInterviews);
  } catch (error) {
    console.error("Error fetching hired applicants:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Get applications for a freelancer
router.get("/applications/freelancer", verifyToken, async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const applications = await Application.find({ userId: req.user._id }).populate(
      "jobId",
      "title company location jobType"
    );
    res.status(200).json(applications);
  } catch (error) {
    console.error("Error fetching freelancer applications", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Update application status (Schedule Meeting/Reject)
router.put("/applications/:id/status", verifyToken, async (req, res) => {
  try {
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

    if (applicationStatus === "MeetingScheduled") {
      application.status = "MeetingScheduled";
    } else if (applicationStatus === "Rejected") {
      application.status = "Rejected";
    } else {
      return res.status(400).json({ message: "Invalid status update" });
    }

    await application.save();

    const notification = new Notification({
      freelancerId: application.userId._id,
      message: applicationStatus === "MeetingScheduled"
        ? `An interview has been scheduled for "${application.jobId.title}" at ${application.jobId.company}.`
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
    }

    if (application.userId.email) {
      const emailSubject = `Application Status Update: ${application.jobId.title}`;
      const emailBody = `
        Hello ${application.userId.firstName || "Freelancer"},
        
        We wanted to inform you about the status of your application submitted on ${new Date(application.createdAt).toLocaleDateString()}:
        
        - **Role**: ${application.jobId.title}
        - **Company**: ${application.jobId.company}
        - **Status**: ${applicationStatus === "MeetingScheduled" ? "Interview Scheduled" : "Rejected"}
        
        ${
          applicationStatus === "MeetingScheduled"
            ? "Please check your 'Scheduled Meetings' page for more details."
            : "We’re sorry to inform you that your application was not successful this time. Keep applying to other opportunities!"
        }
        
        Best regards,
        The Karya Team
      `;
      await sendEmail(application.userId.email, emailSubject, emailBody);
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const isGoogleAuthenticated = !!user.googleTokens;
    res.status(200).json({
      message: `Application ${applicationStatus === "MeetingScheduled" ? "scheduled for interview" : "rejected"} successfully`,
      isGoogleAuthenticated,
      applicationId: application._id,
    });
  } catch (error) {
    console.error("Error updating application status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Confirm hiring after an interview
router.put("/applications/:id/confirm-hire", verifyToken, async (req, res) => {
  try {
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

    const interview = await Interview.findOne({
      applicationId: req.params.id,
      status: "Completed",
    });

    if (!interview) {
      return res.status(400).json({ message: "No completed interview found for this application" });
    }

    if (application.status === "Hired") {
      return res.status(400).json({ message: "Application is already marked as Hired" });
    }

    application.status = "Hired";
    await application.save();

    const notification = new Notification({
      freelancerId: application.userId._id,
      message: `You have been hired for the job "${application.jobId.title}" at ${application.jobId.company}! 🎉`,
    });
    await notification.save();

    const io = req.app.get("io");
    if (io) {
      io.to(application.userId._id.toString()).emit("applicationStatusUpdate", {
        freelancerId: application.userId._id.toString(),
        message: notification.message,
        applicationId: application._id,
      });
    }

    if (application.userId.email) {
      const emailSubject = `Hired for Job: ${application.jobId.title}`;
      const emailBody = `
        Hello ${application.userId.firstName || "Freelancer"},
        
        Congratulations! You have been hired for the job "${application.jobId.title}" at ${application.jobId.company}.
        
        The hirer will create a project for you soon. Check your "Projects" page for updates.
        
        Best regards,
        The Karya Team
      `;
      await sendEmail(application.userId.email, emailSubject, emailBody);
    }

    res.status(200).json({ message: "Freelancer hired successfully" });
  } catch (error) {
    console.error("Error confirming hire:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Route to schedule an interview
router.post("/interviews", verifyToken, async (req, res) => {
  try {
    if (!req.user._id) {
      return res.status(400).json({ message: "User ID is missing in the request" });
    }
    const { applicationId, scheduledTime } = req.body;

    if (!applicationId || !scheduledTime) {
      return res.status(400).json({ message: "Application ID and scheduled time are required" });
    }

    const scheduledDate = new Date(scheduledTime);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ message: "Invalid scheduled time format" });
    }

    const now = new Date();
    if (scheduledDate <= now) {
      return res.status(400).json({ message: "Scheduled time must be in the future" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.googleTokens) {
      return res.status(401).json({ message: "Google authentication required. Please authenticate with Google first." });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        user.googleTokens = tokens;
        await user.save();
      }
    });

    oauth2Client.setCredentials(user.googleTokens);

    if (user.googleTokens.expiry_date && user.googleTokens.expiry_date <= Date.now()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      user.googleTokens = credentials;
      await user.save();
      oauth2Client.setCredentials(credentials);
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

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

    if (application.jobId.hirer._id.toString() !== req.user._id) {
      return res.status(403).json({ message: "Unauthorized: You are not the hirer for this job" });
    }

    // Update application status to "MeetingScheduled"
    application.status = "MeetingScheduled";
    await application.save();

    const freelancerEmail = application.userId?.email;
    const hirerEmail = application.jobId.hirer?.email;

    if (!freelancerEmail || !hirerEmail) {
      return res.status(400).json({ message: "Freelancer or hirer email is missing" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(freelancerEmail)) {
      return res.status(400).json({ message: `Invalid freelancer email address: ${freelancerEmail}` });
    }
    if (!emailRegex.test(hirerEmail)) {
      return res.status(400).json({ message: `Invalid hirer email address: ${hirerEmail}` });
    }

    const event = {
      summary: `Interview for ${application.jobId.title} at ${application.jobId.company}`,
      description: `Interview with ${application.userId.firstName} for the role of ${application.jobId.title}.`,
      start: {
        dateTime: scheduledDate.toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: new Date(scheduledDate.getTime() + 60 * 60 * 1000).toISOString(),
        timeZone: "UTC",
      },
      organizer: {
        email: hirerEmail,
      },
      attendees: [
        { email: freelancerEmail, responseStatus: "needsAction" },
        { email: hirerEmail, responseStatus: "accepted" },
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

    const calendarEvent = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    const meetLink = calendarEvent.data.hangoutLink;
    const googleEventId = calendarEvent.data.id;

    const interview = new Interview({
      applicationId,
      scheduledTime: scheduledDate,
      meetLink,
      createdBy: req.user._id,
      googleEventId,
    });
    await interview.save();

    const io = req.app.get("io");
    if (io) {
      io.to(application.userId._id.toString()).emit("interviewScheduled", {
        freelancerId: application.userId._id.toString(),
        message: `An interview has been scheduled for "${application.jobId.title}" at ${application.jobId.company} on ${scheduledDate.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' })}. Join here: ${meetLink}`,
        meetLink,
        scheduledTime: scheduledDate.toISOString(),
      });
    }

    if (application.userId.email) {
      const emailSubject = `Interview Scheduled: ${application.jobId.title}`;
      const emailBody = `
        Hello ${application.userId.firstName || "Freelancer"},
        
        An interview has been scheduled for your application for "${application.jobId.title}" at ${application.jobId.company}.
        - **Date & Time**: ${scheduledDate.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' })}
        - **Google Meet Link**: ${meetLink}
        
        Please join the meeting at the scheduled time.
        
        Best regards,
        The Karya Team
      `;
      await sendEmail(application.userId.email, emailSubject, emailBody);
    }

    if (application.jobId.hirer.email) {
      const emailSubject = `Interview Scheduled: ${application.jobId.title}`;
      const emailBody = `
        Hello Hirer,
        
        You have scheduled an interview for the role of "${application.jobId.title}" at ${application.jobId.company}.
        - **Candidate**: ${application.userId.firstName || "Freelancer"}
        - **Date & Time**: ${scheduledDate.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' })}
        - **Google Meet Link**: ${meetLink}
        
        Please join the meeting at the scheduled time to conduct the interview.
        
        Best regards,
        The Karya Team
      `;
      await sendEmail(application.jobId.hirer.email, emailSubject, emailBody);
    }

    res.status(201).json({ message: "Interview scheduled successfully", interview });
  } catch (error) {
    console.error("Error scheduling interview:", error.message, error.stack);
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
          {
            path: "jobId",
            select: "title company hirer",
            populate: {
              path: "hirer",
              select: "firstName lastName email",
            },
          },
        ],
      })
      .populate("createdBy", "firstName lastName email")
      .sort({ scheduledTime: -1 });

    const filteredInterviews = interviews.filter((interview) => {
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

// PUT /api/interviews/:id - Reschedule Interview (No status change needed here)
router.put("/interviews/:id", verifyToken, async (req, res) => {
  try {
    const { scheduledTime } = req.body;
    const interview = await Interview.findById(req.params.id).populate({
      path: "applicationId",
      populate: [
        { path: "userId", select: "email firstName" },
        { path: "jobId", select: "title company" },
      ],
    });

    if (!interview) return res.status(404).json({ message: "Interview not found" });

    if (interview.createdBy.toString() !== req.user._id)
      return res.status(403).json({ message: "Unauthorized" });

    interview.scheduledTime = new Date(scheduledTime);
    await interview.save();

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
    const { cancelReason } = req.body;
    if (!cancelReason || !cancelReason.trim()) {
      return res.status(400).json({ message: "Cancellation reason is required" });
    }
    const interview = await Interview.findById(req.params.id).populate({
      path: "applicationId",
      populate: [
        { path: "userId", select: "email firstName" },
        { path: "jobId", select: "title company" },
      ],
    });

    if (!interview) return res.status(404).json({ message: "Interview not found" });

    if (interview.createdBy.toString() !== req.user._id)
      return res.status(403).json({ message: "Unauthorized" });

    // Update application status back to "Pending" if the interview is cancelled
    const application = await Application.findById(interview.applicationId._id);
    if (application) {
      application.status = "Pending";
      await application.save();
    }

    interview.status = "Cancelled";
    await interview.save();

    const freelancer = interview.applicationId.userId;
    const job = interview.applicationId.jobId;

    const io = req.app.get("io");
    if (io) {
      io.to(freelancer._id.toString()).emit("interviewCancelled", {
        freelancerId: freelancer._id.toString(),
        message: `The interview for "${job.title}" has been cancelled. Reason: ${cancelReason || "No reason provided."}`,
      });
    }

    if (freelancer.email) {
      const emailBody = `
        Hello ${freelancer.firstName},
        
        The interview for the position of ${job.title} at ${job.company} has been cancelled.
        
        **Reason for Cancellation:** ${cancelReason || "No reason provided."}
        
        Please contact the hirer for more information if needed.
        
        Best regards,
        The Karya Team
      `;
      await sendEmail(freelancer.email, "Interview Cancelled", emailBody);
    }

    res.status(200).json({ message: "Interview cancelled", interview });
  } catch (error) {
    console.error("Error cancelling interview:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update interview status (Completed/Failed)
router.put("/interviews/:id/status", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;
    const interview = await Interview.findById(req.params.id).populate({
      path: "applicationId",
      populate: { path: "jobId", select: "hirer title" },
    });

    if (!interview) return res.status(404).json({ message: "Interview not found" });
    if (interview.createdBy.toString() !== req.user._id) {
      return res.status(403).json({ message: "Unauthorized: Only the hirer can update the status" });
    }

    if (!["Completed", "Failed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Use 'Completed' or 'Failed'" });
    }

    interview.status = status;
    await interview.save();

    // Update application status based on interview status
    const application = await Application.findById(interview.applicationId._id);
    if (application) {
      if (status === "Completed") {
        application.status = "MeetingCompleted";
      } else if (status === "Failed") {
        application.status = "Rejected";
      }
      await application.save();
    }

    const io = req.app.get("io");
    io.to(interview.applicationId.userId._id.toString()).emit("interviewStatusUpdate", {
      interviewId: interview._id.toString(),
      status,
      message: `The interview for "${interview.applicationId.jobId.title}" has been marked as ${status}.`,
    });
    io.to(interview.applicationId.jobId.hirer._id.toString()).emit("interviewStatusUpdate", {
      interviewId: interview._id.toString(),
      status,
      message: `The interview for "${interview.applicationId.jobId.title}" has been marked as ${status}.`,
    });

    res.status(200).json({ message: `Interview marked as ${status}` });
  } catch (error) {
    console.error("Error updating interview status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;