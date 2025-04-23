import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import verifyToken from "../middlewares/authMiddleware.js";
import Payment from "../models/paymentModel.js";
import Project from "../models/projectModel.js";

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
    // Find the project to get hirer and freelancer details
    const project = await Project.findById(projectId).populate("hirer freelancer");
    if (!project) {
      return res.status(404).send({ error: "Project not found" });
    }

    // Ensure the requesting user is the hirer
    if (project.hirer._id.toString() !== req.user._id) {
      return res.status(403).send({ error: "Unauthorized: Only the hirer can initiate payment" });
    }

    // Create the Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents (Stripe expects amount in cents)
      currency: "usd", // Stripe uses USD, but we'll store the NPR amount in the database
      metadata: { projectId, jobId },
    });

    // Save the payment in the database (pending status)
    const payment = new Payment({
      hirer: project.hirer._id,
      freelancer: project.freelancer._id,
      project: projectId,
      amount: amount, // Store the NPR amount
      currency: "NPR",
      paymentMethod: "stripe",
      transactionId: paymentIntent.id,
      status: "pending",
    });
    await payment.save();

    res.status(200).send({
      clientSecret: paymentIntent.client_secret,
      paymentId: payment._id, // Return the payment ID for confirmation
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
    // Find the payment
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).send({ error: "Payment not found" });
    }

    // Ensure the requesting user is the hirer
    if (payment.hirer.toString() !== req.user._id) {
      return res.status(403).send({ error: "Unauthorized: Only the hirer can confirm payment" });
    }

    // Update payment status to completed
    payment.status = "completed";
    await payment.save();

    // Mark the project as completed
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).send({ error: "Project not found" });
    }
    project.status = "Completed";
    project.updatedAt = Date.now();
    await project.save();

    res.status(200).send({ message: "Payment confirmed and project marked as completed" });
  } catch (error) {
    console.error("Error confirming payment:", error.message);
    res.status(500).send({ error: "Failed to confirm payment" });
  }
});

// Khalti Payment Callback (after successful Khalti payment)
router.post("/khalti-callback", verifyToken, async (req, res) => {
  const { pidx, amount, projectId } = req.body;

  if (!pidx || !amount || !projectId) {
    return res.status(400).send({ error: "Missing required fields (pidx, amount, projectId)" });
  }

  try {
    // Find the project to get hirer and freelancer details
    const project = await Project.findById(projectId).populate("hirer freelancer");
    if (!project) {
      return res.status(404).send({ error: "Project not found" });
    }

    // Ensure the requesting user is the hirer
    if (project.hirer._id.toString() !== req.user._id) {
      return res.status(403).send({ error: "Unauthorized: Only the hirer can confirm payment" });
    }

    // Save the payment in the database (completed status)
    const payment = new Payment({
      hirer: project.hirer._id,
      freelancer: project.freelancer._id,
      project: projectId,
      amount: amount / 100, // Khalti sends amount in paisa, convert to NPR
      currency: "NPR",
      paymentMethod: "khalti",
      transactionId: pidx,
      status: "completed",
    });
    await payment.save();

    // Mark the project as completed
    project.status = "Completed";
    project.updatedAt = Date.now();
    await project.save();

    res.status(200).send({ message: "Payment successful and project marked as completed" });
  } catch (error) {
    console.error("Error processing Khalti payment:", error.message);
    res.status(500).send({ error: "Failed to process Khalti payment" });
  }
});



export default router;