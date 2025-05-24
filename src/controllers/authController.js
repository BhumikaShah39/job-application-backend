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

    // Validate password before hashing
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Invalid password format",
        error: "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
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
      { expiresIn: "2h" }
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
    console.error("Registration error:", err.message);
    if (err.name === "ValidationError") {
      const validationErrors = Object.values(err.errors).map(err => err.message);
      return res.status(400).json({ message: "Validation failed", error: validationErrors.join(", ") });
    }
    res.status(500).json({ message: "Failed to register user", error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: `User with email ${email} not found.` });
    }

    if (user.role === "admin") {
      if (email !== process.env.ADMIN_EMAIL) {
        return res.status(403).json({ message: "Only the pre-registered admin can log in as admin." });
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: `Invalid credentials` });
    }

    const token = jwt.sign(
      { _id: user._id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
      process.env.JWTPRIVATEKEY,
      { expiresIn: "2h" }
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
    console.error("Login error:", err);
    res.status(500).json({ message: "Failed to login", error: err.message });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ user });
  } catch (err) {
    console.error("Error fetching user data:", err);
    res.status(500).json({ message: "Error fetching user data" });
  }
};