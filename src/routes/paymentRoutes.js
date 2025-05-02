
import express from "express";
import axios from "axios"; // For Khalti API requests
import Stripe from "stripe";
import dotenv from "dotenv";
import verifyToken from "../middlewares/authMiddleware.js";
import Payment from "../models/paymentModel.js";
import Project from "../models/projectModel.js";
import User from "../models/userModel.js";

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
      return_url: `http://localhost:5000/api/payment/khalti-callback?projectId=${projectId}&paymentId=${payment._id}`, // Include projectId and paymentId
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
    console.log("Khalti Callback Query:", req.query); // Log the query parameters

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
      payment.amount = parseInt(amount) / 100; // Convert paisa to NPR
      await payment.save();

      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).send({ error: "Project not found" });
      }
      project.status = "Completed";
      project.updatedAt = Date.now();
      await project.save();

      const redirectUrl = `${process.env.FRONTEND_URL}/payment-callback?payment=success&projectId=${projectId}`;
      console.log("Redirecting to:", redirectUrl); // Log the redirect URL
      res.redirect(redirectUrl);
    } else {
      payment.status = lookupStatus === "Pending" ? "pending" : "failed";
      await payment.save();
      const redirectUrl = `${process.env.FRONTEND_URL}/payment-callback?payment=failed&reason=${encodeURIComponent(lookupStatus)}&projectId=${projectId}`;
      console.log("Redirecting to:", redirectUrl); // Log the redirect URL
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
