import dotenv from 'dotenv';
import User from '../models/userModel.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config();

export const register = async (req, res) => {
  try {
    

    const { firstName, lastName, email, password, role } = req.body;

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

  
    res.status(201).json({ message: `User registered with email ${email}` });

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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: `Invalid credentials` });
    }

    // Generate JWT token
    const token = jwt.sign({ _id: user._id, role: user.role }, process.env.JWTPRIVATEKEY, {
      expiresIn: "1h",
    });

    res.status(200).json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
};
