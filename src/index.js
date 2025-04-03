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
import path from "path";
import { fileURLToPath } from "url";
import notificationRoutes from './routes/notificationRoutes.js';
import savedJobRoutes from "./routes/savedJobRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";


dotenv.config();
const app = express();

// Create HTTP Server for Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO
export const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Frontend URL
    methods: ["GET", "POST"],
  },
});

// Attach Socket.IO to the Express app (so it’s accessible in routes)
app.set("io", io);

// Add session middleware globally
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);


// __dirname in ES module environments
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Middleware
app.use(express.json());
app.use(cors({ origin: "http://localhost:5173", credentials: true }));




// Serve static files from the "uploads" folder
app.use("/uploads/resumes", express.static(path.resolve("uploads/resumes")));
// Serve profile images or any other uploads from root uploads folder
app.use("/uploads", express.static(path.resolve("uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api", applicationRoutes);
app.use('/api', notificationRoutes);
app.use("/api/saved-jobs", savedJobRoutes); 
app.use("/api/recommendations", recommendationRoutes);

// Socket.IO Event Handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("applicationStatusUpdate", (data) => {
    console.log(`Sending notification to freelancer ${data.freelancerId}`);
    io.emit(`notification-${data.freelancerId}`, data.message);
  });

  
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});







console.log(process.env.MONGO_URI);

//  Start the server with HTTP (for both Express & Socket.IO)
server.listen(5000, () => {
  connectDB();
  console.log('Server started at http://localhost:5000');
});
