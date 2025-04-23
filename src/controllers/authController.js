import dotenv from 'dotenv';
import User from '../models/userModel.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

export const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Disallow admin registration
    if (role === "admin") {
      return res.status(403).json({ message: "Cannot register as admin." });
    }

    const saltRounds = parseInt(process.env.SALT, 10);
    if (isNaN(saltRounds) || saltRounds < 4 || saltRounds > 31) {
      return res.status(400).json({ message: "Invalid salt rounds" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
    });

    await newUser.save(); // Save to DB

    // Generate JWT token
    const token = jwt.sign(
      { _id: newUser._id, email: newUser.email, role: newUser.role, firstName: newUser.firstName, lastName: newUser.lastName },
      process.env.JWTPRIVATEKEY,
      { expiresIn: "2h" } // Set to 2 hours for consistency with authRoutes.js
    );

    res.status(201).json({
      message: `User registered with email ${email}`,
      token,
      user: {
        _id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: `User with email ${email} not found.` });
    }

    // Special check for admin role
    if (user.role === "admin") {
      if (email !== process.env.ADMIN_EMAIL) {
        return res.status(403).json({ message: "Only the pre-registered admin can log in as admin." });
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: `Invalid credentials` });
    }

    // Generate JWT token
    const token = jwt.sign(
      { _id: user._id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
      process.env.JWTPRIVATEKEY,
      { expiresIn: "2h" } // Set to 2 hours for consistency with authRoutes.js
    );

    res.status(200).json({
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    // Fetch the user by ID (extracted from token by middleware)
    const user = await User.findById(req.user._id).select("-password"); // Exclude password
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ user });
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(500).json({ message: "Error fetching user data" });
  }
};