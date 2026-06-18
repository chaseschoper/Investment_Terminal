const mongoose = require("mongoose");

const EarningsCallSchema = new mongoose.Schema({
  ticker: {
    type: String,
    required: true,
    unique: true
  },
  data: {
    type: Object,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("EarningsCall", EarningsCallSchema);
