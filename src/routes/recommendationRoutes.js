import express from "express";
import { getRecommendedJobs } from "../controllers/recommendationController.js";
import verifyToken from "../middlewares/authMiddleware.js"; 

const router = express.Router();

// Use the controller function and protect the route
router.get("/recommended", verifyToken, getRecommendedJobs);

export default router;
