import jwt from 'jsonwebtoken';
const verifyToken = (req,res,next) => {
  let token;
  let authHeader = req.headers.Authorization || req.headers.authorization ;
  if(authHeader && authHeader.startsWith("Bearer")){
    token = authHeader.split(" ")[1];

    if(!token){
      return res.status(401).json({
        message:"No token, authorization denied"});      
    }

    try{
      const decode = jwt.verify(token,process.env.JWTPRIVATEKEY);//to decode token generated by jwt.sign
      req.user = {_id:decode._id,role:decode.role};
      console.log("The decoded user is:",req.user);
      next();
      
    }catch(err){
      res.status(400).json({message: "Invalid Token"});
    }
  }else{
    return res.status(401).json({
      message:"No token, authorization denied"});    
  };
};
export default verifyToken;



