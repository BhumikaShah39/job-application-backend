import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import verifyToken from "../middlewares/authMiddleware.js";
import Project from "../models/projectModel.js";
import Interview from "../models/interviewModel.js";
import Notification from "../models/notificationModel.js";
import Application from "../models/applicationModel.js";
import { sendEmail } from "../utils/emailSender.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../uploads/tasks"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage }).array("files", 5);

// Create a project after an interview
router.post("/", verifyToken, async (req, res) => {
  try {
    const { interviewId, title, description, duration, deadline, payment } = req.body;

    if (!interviewId || !title) {
      return res.status(400).json({ message: "Interview ID and project title are required" });
    }
    if (!payment) {
      return res.status(400).json({ message: "Project payment is required" });
    }

    const interview = await Interview.findById(interviewId).populate({
      path: "applicationId",
      populate: [
        { path: "userId", select: "email firstName" },
        { path: "jobId", select: "title hirer" },
      ],
    });

    if (!interview) {
      return res.status(404).json({ message: "Interview not found" });
    }

    if (interview.createdBy.toString() !== req.user._id) {
      return res.status(403).json({ message: "Unauthorized: Only the hirer can create a project" });
    }

    if (interview.status !== "Completed") {
      return res.status(400).json({ message: "Interview must be completed to create a project" });
    }

    if (interview.projectCreated) {
      return res.status(400).json({ message: "A project has already been created for this interview" });
    }

    const application = await Application.findById(interview.applicationId._id);
    if (application.status !== "Hired") {
      return res.status(400).json({ message: "Freelancer must be confirmed as hired before creating a project" });
    }

    const project = new Project({
      title,
      description,
      hirer: req.user._id,
      freelancer: interview.applicationId.userId._id,
      applicationId: interview.applicationId._id,
      tasks: [],
      duration: duration ? parseInt(duration) : null,
      deadline: deadline ? new Date(deadline) : null,
      payment: payment ? parseFloat(payment) : null,
    });

    await project.save();

    interview.projectCreated = true;
    await interview.save();

    const notification = new Notification({
      freelancerId: interview.applicationId.userId._id,
      message: `You have been assigned to the project "${title}" related to the job "${interview.applicationId.jobId.title}".`,
      projectId: project._id,
    });
    await notification.save();

    const io = req.app.get("io");
    io.to(interview.applicationId.userId._id.toString()).emit("newProject", {
      freelancerId: interview.applicationId.userId._id.toString(),
      message: notification.message,
      projectId: project._id,
    });

    if (interview.applicationId.userId.email) {
      const emailSubject = `Assigned to Project: ${title}`;
      const emailBody = `
        Hello ${interview.applicationId.userId.firstName || "Freelancer"},
        
        You have been assigned to the project "${title}" related to the job "${interview.applicationId.jobId.title}".
        
        You can view the project details in your dashboard under the "Projects" section.
        
        Best regards,
        The Karya Team
      `;
      await sendEmail(interview.applicationId.userId.email, emailSubject, emailBody);
    }

    res.status(201).json({ message: "Project created successfully", project });
  } catch (error) {
    console.error("Error creating project:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get projects for a hirer
router.get("/hirer", verifyToken, async (req, res) => {
  try {
    console.log(`Fetching projects for hirer: ${req.user._id}`);
    const projects = await Project.find({ hirer: req.user._id })
      .populate("freelancer", "firstName lastName email")
      .populate("applicationId", "jobId")
      .populate({
        path: "applicationId",
        populate: { path: "jobId", select: "title" },
      });

    console.log(`Found ${projects.length} projects for hirer: ${req.user._id}`);
    res.status(200).json(projects);
  } catch (error) {
    console.error("Error fetching hirer projects:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get projects for a freelancer
router.get("/freelancer", verifyToken, async (req, res) => {
  try {
    console.log(`Fetching projects for freelancer: ${req.user._id}`);
    const projects = await Project.find({ freelancer: req.user._id })
      .populate("hirer", "firstName lastName email")
      .populate("applicationId", "jobId")
      .populate({
        path: "applicationId",
        populate: { path: "jobId", select: "title" },
      });

    console.log(`Found ${projects.length} projects for freelancer: ${req.user._id}`);
    res.status(200).json(projects);
  } catch (error) {
    console.error("Error fetching freelancer projects:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get a specific project by ID
router.get("/:id", verifyToken, async (req, res) => {
  console.log("=== GET /projects/:id ===");
  console.log("Requested ID:", req.params.id);
  console.log("Requesting user ID:", req.user._id);
  try {
    console.log(`Fetching project with ID: ${req.params.id} for user: ${req.user._id}`);

    const project = await Project.findById(req.params.id)
      .populate("hirer", "firstName lastName email")
      .populate("freelancer", "firstName lastName email")
      .populate({
        path: "applicationId",
        populate: { path: "jobId", select: "title" },
      });

    if (!project) {
      console.log(`Project not found for ID: ${req.params.id}`);
      return res.status(404).json({ message: "Project not found" });
    }

    console.log(`Project found: hirer=${project.hirer?._id}, freelancer=${project.freelancer?._id}`);

    const isHirer = project.hirer && project.hirer._id.toString() === req.user._id;
    const isFreelancer = project.freelancer && project.freelancer._id.toString() === req.user._id;

    if (!isHirer && !isFreelancer) {
      console.log(`Unauthorized access by user: ${req.user._id} (role: ${req.user.role})`);
      return res.status(403).json({ message: "Unauthorized: You are not associated with this project" });
    }

    if (!project.tasks) {
      project.tasks = [];
    }

    res.status(200).json(project);
  } catch (error) {
    console.error("Error fetching project:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Mark project as completed (moved to payment confirmation)
router.put("/:id/complete", verifyToken, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate("freelancer", "email firstName paymentInfo");
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.hirer.toString() !== req.user._id) {
      return res.status(403).json({ message: "Unauthorized: Only the hirer can mark a project as completed" });
    }

    if (project.status === "Completed") {
      return res.status(400).json({ message: "Project is already marked as completed" });
    }

    project.status = "Completed";
    project.updatedAt = Date.now();
    await project.save();
    console.log(`Project ${project._id} marked as Completed`);

    res.status(200).json({ message: "Project marked as completed." });
  } catch (error) {
    console.error("Error marking project as completed:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Create a task for a project
router.post("/:id/tasks", verifyToken, upload, async (req, res) => {
  try {
    const { title, description, deadline } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Task title is required" });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.hirer.toString() !== req.user._id) {
      return res.status(403).json({ message: "Unauthorized: Only the hirer can add tasks" });
    }

    const files = req.files
      ? req.files.map((file) => `/uploads/tasks/${file.filename}`)
      : [];

    const task = {
      title,
      description,
      deadline: deadline ? new Date(deadline) : null,
      status: "To-Do",
      files,
    };

    project.tasks.push(task);
    await project.save();

    const createdTask = project.tasks[project.tasks.length - 1];
    res.status(201).json({ message: "Task created successfully", task: createdTask });
  } catch (error) {
    console.error("Error creating task:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Update task status
router.put("/:projectId/tasks/:taskId", verifyToken, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["To-Do", "In-Progress", "Done"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Use 'To-Do', 'In-Progress', or 'Done'" });
    }

    const project = await Project.findById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (
      project.hirer.toString() !== req.user._id &&
      project.freelancer.toString() !== req.user._id
    ) {
      return res.status(403).json({ message: "Unauthorized: Only the hirer or freelancer assigned to this project can update tasks" });
    }

    const task = project.tasks.id(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    task.status = status;
    await project.save();

    res.status(200).json({ message: "Task status updated successfully", task });
  } catch (error) {
    console.error("Error updating task status:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Get project completion stats (for Analytics.jsx)
router.get("/completion", verifyToken, async (req, res) => {
  try {
    const totalProjects = await Project.countDocuments();
    const completed = await Project.countDocuments({ status: "Completed" });

    res.status(200).json({
      totalProjects,
      completed,
    });
  } catch (error) {
    console.error("Error fetching project completion stats:", error.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;