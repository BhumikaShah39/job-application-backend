import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors'; 
import { connectDB } from './config/dbConnect.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import jobRoutes from "./routes/jobRoutes.js";
import applicationRoutes from "./routes/applicationRoutes.js";


dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(cors()); 

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users",userRoutes);
app.use("/api/jobs", jobRoutes);
console.log("Using applicationRoutes at /api");
app.use("/api", applicationRoutes);
//app.use(express.urlencoded({ extended: true }));



console.log(process.env.MONGO_URI);

// Start the server
app.listen(5000, () => {
  connectDB();
  console.log('Server started at http://localhost:5000');
});
