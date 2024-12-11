import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors'; 
import { connectDB } from './config/db.js';

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(cors()); 

// Routes
app.get("/", (req, res) => {
  res.send("Server is ready1234");
});

console.log(process.env.MONGO_URI);

// Start the server
app.listen(5000, () => {
  connectDB();
  console.log('Server started at http://localhost:5000');
});
