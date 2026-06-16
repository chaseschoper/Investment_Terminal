const mongoose = require("mongoose");

const StockSchema = new mongoose.Schema({
  ticker: {
    type: String,
    unique: true
  },

  data: {
    type: Object,
    default: {}
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Stock", StockSchema);