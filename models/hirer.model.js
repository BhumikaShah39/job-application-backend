import mongoose from "mongoose";

const hirerSchema = new mongoose.Schema({
  name:{
    type: String,
    required: true,
  },

});

const hirer = mongoose.model('Hirer',hirerSchema);

export default hirer;

