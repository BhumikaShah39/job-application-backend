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



dotenv.config();
const app = express();

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
app.use("/api/users",userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api", applicationRoutes);



console.log("Static files served from:", path.join(__dirname, "uploads"));


console.log(process.env.MONGO_URI);

// Start the server
app.listen(5000, () => {
  connectDB();
  console.log('Server started at http://localhost:5000');
});
