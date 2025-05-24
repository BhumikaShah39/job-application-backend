import express from "express";
import { register, login } from "../controllers/authController.js";
import { google } from "googleapis";
import session from "express-session";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";
import nodemailer from "nodemailer";
import crypto from "crypto";
import bcrypt from "bcrypt";
import verifyToken from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Handle token refresh
oauth2Client.on("tokens", async (tokens) => {
  if (tokens.refresh_token) {
    const user = await User.findOne({ "googleTokens.refresh_token": tokens.refresh_token });
    if (user) {
      user.googleTokens = tokens;
      await user.save();
      console.log("Google OAuth tokens updated for user:", user._id);
    }
  }
});

// Check if the user is authenticated with Google
router.get("/check-google-auth", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;
    console.log("Checking Google auth for userId:", userId);
    const user = await User.findById(userId);

    if (!user) {
      console.log("User not found for userId:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    const isGoogleAuthenticated = !!user.googleTokens && user.googleTokens.expiry_date > Date.now();
    console.log("Google authentication status:", isGoogleAuthenticated);
    res.status(200).json({ message: "Google authentication status checked", isGoogleAuthenticated });
  } catch (error) {
    console.error("Error checking Google authentication:", error.message, error.stack);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

router.get("/google", (req, res) => {
  const token = req.query.token;
  console.log("Token received in /google:", token);
  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state: encodeURIComponent(token),
  });
  console.log("Generated OAuth URL:", url);
  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    console.log("Code received:", code);
    console.log("State (encoded JWT token) received:", state);

    if (!code) {
      throw new Error("Code parameter missing in Google OAuth callback");
    }

    if (!state) {
      throw new Error("State parameter missing in Google OAuth callback");
    }

    const decodedState = decodeURIComponent(state);
    console.log("URL-decoded state:", decodedState);

    const [header, payload, signature] = decodedState.split(".");
    const decodedHeader = JSON.parse(Buffer.from(header, "base64").toString());
    const decodedPayload = JSON.parse(Buffer.from(payload, "base64").toString());
    console.log("Decoded JWT Header:", decodedHeader);
    console.log("Decoded JWT Payload:", decodedPayload);

    let decoded;
    try {
      decoded = jwt.verify(decodedState, process.env.JWTPRIVATEKEY);
    } catch (jwtError) {
      console.error("JWT verification failed:", jwtError.message);
      throw new Error("Invalid or expired JWT token");
    }
    console.log("Decoded JWT:", decoded);

    const user = await User.findById(decoded._id);
    if (!user) {
      console.log("User not found for ID:", decoded._id);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("Attempting to exchange code for tokens...");
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      console.warn("No refresh token received — can't refresh later");
      return res.status(400).json({ message: "Google authentication failed. Please try again." });
    }

    console.log("Google OAuth tokens:", tokens);
    oauth2Client.setCredentials(tokens);

    user.googleTokens = tokens;
    await user.save();

    const userToken = jwt.sign(
      {
        _id: user._id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      process.env.JWTPRIVATEKEY,
      { expiresIn: "2h" }
    );

    console.log("Redirecting to dashboard with token:", userToken);
    res.redirect(`${process.env.FRONTEND_URL}/hirer/${user._id}?token=${userToken}`);
  } catch (error) {
    console.error("Error in Google OAuth callback:", error.message);
    res.status(500).json({ message: "Authentication failed" });
  }
});

router.get("/check-tokens", (req, res) => {
  if (req.session.googleTokens) {
    res.json({ message: "Tokens found", tokens: req.session.googleTokens });
  } else {
    res.json({ message: "No tokens found" });
  }
});

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Forgot Password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <p>You are receiving this email because you (or someone else) requested a password reset for your account.</p>
        <p>Please click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request this, please ignore this email.</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Password reset link sent to your email" });
  } catch (error) {
    console.error("Error in forgot password:", error);
    res.status(500).json({ message: "Failed to send reset link" });
  }
});

// Reset Password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    console.log("Reset password request received with token:", token);

    if (!token || !newPassword) {
      console.log("Missing token or newPassword");
      return res.status(400).json({ message: "Token and new password are required" });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      console.log("Invalid password format");
      return res.status(400).json({
        message: "Invalid password format",
        error: "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
      });
    }

    console.log("Searching for user with token:", token);
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      console.log("Invalid or expired reset token");
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    console.log("Hashing new password...");
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    console.log("Hashed password generated");

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    console.log("Saving user with updated password...");
    await user.save();
    console.log("User saved successfully");

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password:", {
      message: error.message,
      stack: error.stack,
      details: error,
    });
    res.status(500).json({ message: "Failed to reset password" });
  }
});

router.post("/register", register);
router.post("/login", login);

export default router;