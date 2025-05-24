import express from "express";
import axios from "axios";
import Stripe from "stripe";
import dotenv from "dotenv";
import verifyToken from "../middlewares/authMiddleware.js";
import Payment from "../models/paymentModel.js";
import Project from "../models/projectModel.js";
import User from "../models/userModel.js";
import Review from "../models/reviewModel.js";
import Notification from "../models/notificationModel.js"; // Import Notification model
import { calculateUserBadge } from "../controllers/userController.js";

dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create a Payment Intent (for Stripe)
router.post("/create-payment-intent", verifyToken, async (req, res) => {
  const { amount, jobId, projectId } = req.body;

  if (!amount || isNaN(amount) || !projectId) {
    return res.status(400).send({ error: "Invalid amount or project ID provided" });
  }

  try {
    const project = await Project.findById(projectId).populate("hirer freelancer");
    if (!project) {
      return res.status(404).send({ error: "Project not found" });
    }

    if (project.hirer._id.toString() !== req.user._id) {
      return res.status(403).send({ error: "Unauthorized: Only the hirer can initiate payment" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      metadata: { projectId, jobId },
    });

    const payment = new Payment({
      hirer: project.hirer._id,
      freelancer: project.freelancer._id,
      project: projectId,
      amount: amount,
      currency: "NPR",
      paymentMethod: "stripe",
      transactionId: paymentIntent.id,
      status: "pending",
    });
    await payment.save();

    res.status(200).send({
      clientSecret: paymentIntent.client_secret,
      paymentId: payment._id,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error.message);
    res.status(500).send({ error: "Failed to create payment intent" });
  }
});

// Confirm Stripe Payment (after client-side confirmation)
router.post("/confirm-stripe-payment", verifyToken, async (req, res) => {
  const { paymentId, projectId } = req.body;

  if (!paymentId || !projectId) {
    return res.status(400).send({ error: "Payment ID and Project ID are required" });
  }

  try {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).send({ error: "Payment not found" });
    }

    if (payment.hirer.toString() !== req.user._id) {
      return res.status(403).send({ error: "Unauthorized: Only the hirer can confirm payment" });
    }

    payment.status = "completed";
    await payment.save();

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).send({ error: "Project not found" });
    }
    project.status = "Completed";
    project.updatedAt = Date.now();
    await project.save();

    // Save and send Socket.io notification to freelancer
    try {
      const notification = new Notification({
        freelancerId: project.freelancer._id,
        message: `Payment for project "${project.title}" has been received. Please rate the hirer.`,
        projectId: project._id,
      });
      await notification.save();

      const io = req.app.get("io");
      if (io) {
        io.to(project.freelancer._id.toString()).emit("paymentReceived", {
          freelancerId: project.freelancer._id.toString(),
          message: notification.message,
          projectId: project._id.toString(),
        });
        console.log(`Notification sent to freelancer ${project.freelancer._id} for project ${project._id}`);
      } else {
        console.warn("Socket.io instance not available");
      }
    } catch (notificationError) {
      console.error("Error sending notification:", notificationError.message);
    }

    res.status(200).send({ message: "Payment confirmed and project marked as completed", projectId });
  } catch (error) {
    console.error("Error confirming payment:", error.message);
    res.status(500).send({ error: "Failed to confirm payment" });
  }
});

// Initiate Khalti Payment
router.post("/initiate-khalti-payment", verifyToken, async (req, res) => {
  const { amount, projectId } = req.body;

  if (!amount || isNaN(amount) || !projectId) {
    return res.status(400).send({ error: "Invalid amount or project ID provided" });
  }

  const amountInPaisa = amount * 100;
  if (amountInPaisa < 1000) {
    return res.status(400).send({ error: "Amount must be at least 1000 paisa (10 NPR)" });
  }

  try {
    const project = await Project.findById(projectId).populate("hirer freelancer");
    if (!project) {
      return res.status(404).send({ error: "Project not found" });
    }

    if (project.hirer._id.toString() !== req.user._id) {
      return res.status(403).send({ error: "Unauthorized: Only the hirer can initiate payment" });
    }

    const freelancer = await User.findById(project.freelancer._id);
    if (!freelancer.khaltiId) {
      return res.status(400).send({ error: "Freelancer has not provided Khalti ID" });
    }

    const payment = new Payment({
      hirer: project.hirer._id,
      freelancer: project.freelancer._id,
      project: projectId,
      amount: amount,
      currency: "NPR",
      paymentMethod: "khalti",
      transactionId: "pending",
      status: "pending",
      freelancerKhaltiId: freelancer.khaltiId,
    });
    await payment.save();

    const payload = {
      return_url: `http://localhost:5000/api/payment/khalti-callback?projectId=${projectId}&paymentId=${payment._id}`,
      website_url: process.env.FRONTEND_URL,
      amount: amountInPaisa,
      purchase_order_id: projectId,
      purchase_order_name: project.title,
      customer_info: {
        name: `${project.hirer.firstName} ${project.hirer.lastName}`,
        email: project.hirer.email,
        phone: "9800000000",
      },
      amount_breakdown: [
        {
          label: "Base Price",
          amount: amountInPaisa,
        },
      ],
      product_details: [
        {
          identity: projectId,
          name: project.title,
          total_price: amountInPaisa,
          quantity: 1,
          unit_price: amountInPaisa,
        },
      ],
      merchant_username: project.hirer.email,
      merchant_project_id: projectId,
    };

    if (!process.env.KHALTI_TEST_SECRET_KEY) {
      console.error("Khalti secret key is not defined in environment variables");
      return res.status(500).send({ error: "Khalti secret key not configured" });
    }

    const authHeader = `Key ${process.env.KHALTI_TEST_SECRET_KEY}`;
    const response = await axios.post(
      "https://dev.khalti.com/api/v2/epayment/initiate/",
      payload,
      {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Khalti Initiate Response:", JSON.stringify(response.data, null, 2));

    if (response.data && response.data.pidx && response.data.payment_url) {
      payment.transactionId = response.data.pidx;
      await payment.save();

      res.status(200).send({
        paymentId: payment._id,
        pidx: response.data.pidx,
        payment_url: response.data.payment_url,
        amount: amountInPaisa,
      });
    } else {
      throw new Error("Failed to initiate Khalti payment: Invalid response from Khalti");
    }
  } catch (error) {
    console.error("Error initiating Khalti payment:", error.response?.data || error.message);
    res.status(500).send({
      error: "Failed to initiate Khalti payment",
      details: error.response?.data?.error_key
        ? `${error.response.data.error_key}: ${JSON.stringify(error.response.data)}`
        : error.message,
    });
  }
});

// Khalti Callback
router.get("/khalti-callback", async (req, res) => {
  const { pidx, transaction_id, amount, projectId, paymentId } = req.query;

  if (!pidx || !projectId || !paymentId) {
    return res.status(400).send({ error: "Missing required fields in callback" });
  }

  try {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).send({ error: "Payment not found" });
    }

    if (!process.env.KHALTI_TEST_SECRET_KEY) {
      console.error("Khalti secret key is not defined in environment variables");
      return res.status(500).send({ error: "Khalti secret key not configured" });
    }

    const authHeader = `Key ${process.env.KHALTI_TEST_SECRET_KEY}`;
    console.log("Callback Request Origin:", req.headers["user-agent"], req.ip);
    console.log("Khalti Callback Query:", req.query);

    const lookupResponse = await axios.post(
      "https://dev.khalti.com/api/v2/epayment/lookup/",
      { pidx },
      {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Khalti Lookup Response:", JSON.stringify(lookupResponse.data, null, 2));

    const lookupStatus = lookupResponse.data.status;
    if (lookupStatus === "Completed") {
      console.log(`Payment completed. Funds intended for freelancer Khalti ID: ${payment.freelancerKhaltiId}`);
      payment.transactionId = transaction_id || lookupResponse.data.transaction_id;
      payment.status = "completed";
      payment.amount = parseInt(amount) / 100;
      await payment.save();

      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).send({ error: "Project not found" });
      }
      project.status = "Completed";
      project.updatedAt = Date.now();
      await project.save();

      // Save and send Socket.io notification to freelancer
      try {
        const notification = new Notification({
          freelancerId: project.freelancer._id,
          message: `Payment for project "${project.title}" has been received. Please rate the hirer.`,
          projectId: project._id,
        });
        await notification.save();

        const io = req.app.get("io");
        if (io) {
          io.to(project.freelancer._id.toString()).emit("paymentReceived", {
            freelancerId: project.freelancer._id.toString(),
            message: notification.message,
            projectId: project._id.toString(),
          });
          console.log(`Notification sent to freelancer ${project.freelancer._id} for project ${project._id}`);
        } else {
          console.warn("Socket.io instance not available");
        }
      } catch (notificationError) {
        console.error("Error sending notification:", notificationError.message);
      }

      const redirectUrl = `${process.env.FRONTEND_URL}/projects/${projectId}/payment?payment=success&reviewPending=true`;
      console.log("Redirecting to:", redirectUrl);
      res.redirect(redirectUrl);
    } else {
      payment.status = lookupStatus === "Pending" ? "pending" : "failed";
      await payment.save();
      const redirectUrl = `${process.env.FRONTEND_URL}/projects/${projectId}/payment?payment=failed&reason=${encodeURIComponent(lookupStatus)}`;
      console.log("Redirecting to:", redirectUrl);
      res.redirect(redirectUrl);
    }
  } catch (error) {
    console.error("Error verifying Khalti payment:", error.response?.data || error.message);
    res.status(500).send({
      error: "Failed to verify Khalti payment",
      details: error.response?.data?.error_key
        ? `${error.response.data.error_key}: ${JSON.stringify(error.response.data)}`
        : error.message,
    });
  }
});

// Fetch payments for a specific project
router.get("/project/:projectId", verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid project ID format" });
    }

    const payments = await Payment.find({ project: projectId })
      .populate("hirer", "firstName lastName")
      .populate("freelancer", "firstName lastName");

    res.status(200).json(payments);
  } catch (error) {
    console.error("Error fetching payments for project:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Submit a review after payment
router.post("/submit-review", verifyToken, async (req, res) => {
  try {
    console.log("Received review submission request:", req.body);

    const { projectId, paymentId, ratedUserId, rating, comment } = req.body;

    // Validate required fields
    console.log("Validating required fields...");
    if (!projectId || !paymentId || !ratedUserId || !rating) {
      console.log("Missing required fields:", { projectId, paymentId, ratedUserId, rating });
      return res.status(400).send({ error: "Project ID, payment ID, rated user ID, and rating are required" });
    }

    if (rating < 1 || rating > 5) {
      console.log("Invalid rating:", rating);
      return res.status(400).send({ error: "Rating must be between 1 and 5" });
    }

    // Verify the project exists and is completed
    console.log(`Fetching project with ID: ${projectId}`);
    const project = await Project.findById(projectId).populate("hirer freelancer");
    if (!project) {
      console.log(`Project ${projectId} not found`);
      return res.status(404).send({ error: "Project not found" });
    }
    console.log(`Project ${projectId} found:`, project);
    if (project.status !== "Completed") {
      console.log(`Project ${projectId} is not completed: ${project.status}`);
      return res.status(400).send({ error: "Project must be completed to submit a review" });
    }

    // Verify user authorization
    console.log("Checking user authorization...");
    const isHirer = project.hirer._id.toString() === req.user._id;
    const isFreelancer = project.freelancer._id.toString() === req.user._id;
    if (!isHirer && !isFreelancer) {
      console.log(`User ${req.user._id} is not part of project ${projectId}`);
      return res.status(403).send({ error: "Unauthorized: You are not part of this project" });
    }

    // Verify the rated user
    if (isHirer && ratedUserId !== project.freelancer._id.toString()) {
      console.log(`Hirer ${req.user._id} tried to rate user ${ratedUserId} instead of freelancer ${project.freelancer._id}`);
      return res.status(400).send({ error: "You can only rate the freelancer of this project" });
    }
    if (isFreelancer && ratedUserId !== project.hirer._id.toString()) {
      console.log(`Freelancer ${req.user._id} tried to rate user ${ratedUserId} instead of hirer ${project.hirer._id}`);
      return res.status(400).send({ error: "You can only rate the hirer of this project" });
    }

    console.log(`Fetching rated user with ID: ${ratedUserId}`);
    const ratedUser = await User.findById(ratedUserId);
    if (!ratedUser) {
      console.log(`Rated user ${ratedUserId} not found`);
      return res.status(404).send({ error: "Rated user not found" });
    }
    console.log(`Rated user ${ratedUserId} found:`, ratedUser);

    // Verify the payment exists and is completed
    console.log(`Fetching payment with ID: ${paymentId}`);
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      console.log(`Payment ${paymentId} not found`);
      return res.status(404).send({ error: "Payment not found" });
    }
    console.log(`Payment ${paymentId} found:`, payment);
    if (payment.status !== "completed") {
      console.log(`Payment ${paymentId} is not completed: ${payment.status}`);
      return res.status(400).send({ error: "Payment must be completed to submit a review" });
    }
    if (payment.project.toString() !== projectId) {
      console.log(`Payment ${paymentId} does not belong to project ${projectId}`);
      return res.status(400).send({ error: "Payment does not belong to this project" });
    }

    // Check for duplicate reviews
    console.log("Checking for existing review...");
    const existingReview = await Review.findOne({
      project: projectId,
      reviewer: req.user._id,
      reviewedUser: ratedUserId,
    });
    if (existingReview) {
      console.log("Duplicate review found:", existingReview);
      return res.status(400).send({ error: "You have already reviewed this user for this project" });
    }
    console.log("No duplicate review found");

    // Create the review
    console.log("Creating new review...");
    const review = new Review({
      project: projectId,
      payment: paymentId,
      reviewer: req.user._id,
      reviewedUser: ratedUserId,
      rating,
      comment,
    });
    await review.save();
    console.log("Review saved successfully:", review);

    // Recalculate badge for the reviewed user
    console.log(`Recalculating badge for user ${ratedUserId}`);
    await calculateUserBadge(ratedUserId);
    console.log(`Badge recalculation completed for user ${ratedUserId}`);

    res.status(200).send({ message: "Review submitted successfully", review });
  } catch (error) {
    console.error("Error submitting review:", error.message, error.stack);
    res.status(500).send({ error: "Failed to submit review", details: error.message });
  }
});

// Get payments sent by a hirer
router.get("/sent", verifyToken, async (req, res) => {
  try {
    const payments = await Payment.find({ hirer: req.user._id })
      .populate("freelancer", "firstName lastName email")
      .populate("project", "title");
    res.status(200).json(payments);
  } catch (error) {
    console.error("Error fetching sent payments:", error.message);
    res.status(500).json({ error: "Failed to fetch sent payments" });
  }
});

// Get payments received by a freelancer
router.get("/received", verifyToken, async (req, res) => {
  try {
    const payments = await Payment.find({ freelancer: req.user._id })
      .populate("hirer", "firstName lastName email")
      .populate("project", "title");
    res.status(200).json(payments);
  } catch (error) {
    console.error("Error fetching received payments:", error.message);
    res.status(500).json({ error: "Failed to fetch received payments" });
  }
});

export default router;