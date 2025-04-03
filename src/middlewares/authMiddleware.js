import jwt from 'jsonwebtoken';

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  // If no token is found
  if (!token) {
    return res.status(401).json({
      message: "No token, authorization denied"
    });
  }

  try {
    // Decode the token using JWT secret
    const decoded = jwt.verify(token, process.env.JWTPRIVATEKEY); // Decode token
    req.user = { _id: decoded._id, role: decoded.role }; // Attach the user info to the request object
    console.log("The decoded user is:", req.user);
    console.log("Decoded User ID:", req.user._id);
    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    console.error("Token verification failed:", error.message);
    res.status(400).json({ message: "Invalid Token" }); // If token is invalid, send error
  }
};

export default verifyToken;
