import express from 'express';
import { register, login } from '../controllers/authController.js';
import { google } from "googleapis";
import session from "express-session";
import jwt from 'jsonwebtoken';
import  User  from '../models/userModel.js';

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
oauth2Client.on('tokens', async (tokens) => {
  if (tokens.refresh_token) {
    const user = await User.findOne({ 'googleTokens.refresh_token': tokens.refresh_token });
    if (user) {
      user.googleTokens = tokens;
      await user.save();
      console.log("Google OAuth tokens updated for user:", user._id);
    }
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
    "https://www.googleapis.com/auth/calendar.events"
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state: encodeURIComponent(token)
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

    const [header, payload, signature] = decodedState.split('.');
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64').toString());
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
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

router.post("/register", register);
router.post("/login", login);

export default router;