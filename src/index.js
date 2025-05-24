import http from 'http';
import { Server } from 'socket.io';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import session from "express-session";
import { connectDB } from './config/dbConnect.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import notificationRoutes from './routes/notificationRoutes.js';
import savedJobRoutes from "./routes/savedJobRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js"; 
import path from "path";
import { fileURLToPath } from "url";
import cron from 'node-cron';
import Interview from './models/interviewModel.js';
import User from './models/userModel.js';
import { google } from 'googleapis';

dotenv.config();
const app = express();

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

app.use("/uploads/resumes", express.static(path.resolve("uploads/resumes")));
app.use("/uploads", express.static(path.resolve("uploads")));
app.use("/uploads/tasks", express.static(path.resolve("uploads/tasks")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api", applicationRoutes);
app.use('/api', notificationRoutes);
app.use("/api/saved-jobs", savedJobRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/reviews", reviewRoutes); 

// Basic route to verify server is running
app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is running" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err.message, err.stack);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("applicationStatusUpdate", (data) => {
    console.log(`Sending notification to freelancer ${data.freelancerId}`);
    io.emit(`notification-${data.freelancerId}`, data.message);
  });

  socket.on("newProject", (data) => {
    console.log(`Sending project notification to freelancer ${data.freelancerId}`);
    io.emit(`notification-${data.freelancerId}`, data.message);
  });

  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const MEETING_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

cron.schedule("*/15 * * * *", async () => {
  try {
    console.log("Cron job running at:", new Date().toISOString());
    const now = new Date();
    const interviews = await Interview.find({
      status: "Scheduled",
      scheduledTime: { $lt: now },
    }).populate({
      path: "applicationId",
      populate: { path: "jobId", select: "hirer title" },
    });

    console.log(`Found ${interviews.length} scheduled interviews to process.`);

    for (const interview of interviews) {
      const scheduledEndTime = new Date(interview.scheduledTime.getTime() + MEETING_DURATION);
      console.log(`Processing interview ${interview._id}, scheduled for ${interview.scheduledTime.toISOString()}`);
      console.log(`Scheduled end time: ${scheduledEndTime.toISOString()}`);

      if (now > scheduledEndTime) {
        interview.status = "Completed";
        await interview.save();
        console.log(`Interview ${interview._id} marked as Completed (time-based)`);

        io.to(interview.applicationId.userId._id.toString()).emit("interviewStatusUpdate", {
          interviewId: interview._id.toString(),
          status: "Completed",
          message: `The interview for "${interview.applicationId.jobId.title}" has been marked as Completed.`,
        });
        io.to(interview.applicationId.jobId.hirer._id.toString()).emit("interviewStatusUpdate", {
          interviewId: interview._id.toString(),
          status: "Completed",
          message: `The interview for "${interview.applicationId.jobId.title}" has been marked as Completed.`,
        });
      }
    }
  } catch (error) {
    console.error("Error updating interview statuses:", error);
  }
});

server.listen(process.env.PORT || 5000, () => {
  connectDB();
  console.log(`Server started at http://localhost:${process.env.PORT || 5000}`);
});