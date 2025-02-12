import http from 'http';
import { Server } from 'socket.io';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors'; 
import { connectDB } from './config/dbConnect.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import notificationRoutes from './routes/notificationRoutes.js';
import savedJobRoutes from "./routes/savedJobRoutes.js";

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

// Socket.IO Event Handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Optional: You can listen for custom events here if needed
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// __dirname in ES module environments
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.json());
app.use(cors());

// Serve static files from the "uploads" folder
app.use("/uploads", express.static("uploads"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api", applicationRoutes);
app.use('/api', notificationRoutes);
app.use("/api/saved-jobs", savedJobRoutes); 

console.log("Static files served from:", path.join(__dirname, "uploads"));
console.log(process.env.MONGO_URI);

//  Start the server with HTTP (for both Express & Socket.IO)
server.listen(5000, () => {
  connectDB();
  console.log('Server started at http://localhost:5000');
});
