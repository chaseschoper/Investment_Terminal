const mongoose = require("mongoose");

const StockSchema = new mongoose.Schema({
  ticker: {
    type: String,
    required: true,
    unique: true
  },

  status: {
    type: String,
    default: "pending"
  },

  data: {
    type: Object,
    default: {}
  },

  error: String,

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Stock", StockSchema);