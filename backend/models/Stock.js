const mongoose = require("mongoose");

const StockSchema = new mongoose.Schema({
  ticker: {
    type: String,
    required: true
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

StockSchema.index({ ticker: 1 }, { unique: true });

module.exports = mongoose.model("Stock", StockSchema);
